use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

// Dev gets its own port (and identifier/data dir via tauri.dev.json) so it can run next to the installed app
const PORT: u16 = if cfg!(debug_assertions) { 18081 } else { 18080 };
/// Passed by the login item: start in the tray without opening the window
const HIDDEN_ARG: &str = "--hidden";

struct Api(Mutex<Option<Child>>);

/// (python, api dir, extra bin dir for ffmpeg/ffprobe/yt-dlp)
fn api_paths(app: &AppHandle) -> (PathBuf, PathBuf, PathBuf) {
    if cfg!(debug_assertions) {
        // Live API code + venv, but the same staged ffmpeg/yt-dlp as the release build
        let src = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let api = src.join("../../api");
        (api.join(".venv/bin/python"), api, src.join("resources/bin"))
    } else {
        let res = app.path().resource_dir().expect("resource dir");
        (res.join("python/bin/python3"), res.join("api"), res.join("bin"))
    }
}

/// One random key per install. Never overwrite: secrets in the DB are encrypted with it.
fn encryption_key(data: &Path) -> std::io::Result<String> {
    let path = data.join("encryption.key");
    if let Ok(k) = fs::read_to_string(&path) {
        return Ok(k.trim().to_string());
    }
    let mut buf = [0u8; 32];
    File::open("/dev/urandom")?.read_exact(&mut buf)?;
    let key: String = buf.iter().map(|b| format!("{b:02x}")).collect();
    let mut f = OpenOptions::new().write(true).create_new(true).mode(0o600).open(&path)?;
    f.write_all(key.as_bytes())?;
    Ok(key)
}

/// A force-killed app (tauri dev rebuild, crash) leaves uvicorn running and holding the port.
/// Stop that leftover, but only if the pid still is our uvicorn (pids get reused).
fn stop_stale_api(pidfile: &Path) {
    let Ok(pid) = fs::read_to_string(pidfile) else { return };
    let pid = pid.trim();
    let cmd = Command::new("ps").args(["-o", "command=", "-p", pid]).output();
    if cmd.is_ok_and(|o| String::from_utf8_lossy(&o.stdout).contains("uvicorn app.main:app")) {
        let _ = Command::new("kill").arg(pid).status();
        for _ in 0..50 {
            if !healthy() {
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
    }
    let _ = fs::remove_file(pidfile);
}

fn start_api(app: &AppHandle) -> Result<Child, String> {
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    let pidfile = data.join("api.pid");
    stop_stale_api(&pidfile);
    let key = encryption_key(&data).map_err(|e| e.to_string())?;
    let (python, api_dir, bin) = api_paths(app);
    let log = File::create(data.join("api.log")).map_err(|e| e.to_string())?;
    let path = format!("{}:{}", bin.display(), std::env::var("PATH").unwrap_or_default());

    let mut cmd = Command::new(python);
    if !cfg!(debug_assertions) {
        // The API serves the frontend too, see create_main
        cmd.env("WEB_DIST", api_dir.join("../web"));
    }
    let child = cmd
        .args(["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1"])
        .args(["--port", &PORT.to_string(), "--timeout-graceful-shutdown", "5"])
        .current_dir(api_dir)
        .env("PATH", path)
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .env("STORAGE_PATH", &data)
        .env("DATABASE_URL", format!("sqlite+aiosqlite:///{}", data.join("cliper.db").display()))
        .env("HF_HOME", data.join("hf"))
        .env("CORS_ORIGINS", "http://localhost:3031")
        .env("PUBLIC_API_URL", format!("http://127.0.0.1:{PORT}"))
        .env("ENCRYPTION_KEY", key)
        .stdout(log.try_clone().map_err(|e| e.to_string())?)
        .stderr(log)
        .spawn()
        .map_err(|e| e.to_string())?;
    let _ = fs::write(pidfile, child.id().to_string());
    Ok(child)
}

fn stop_api(app: &AppHandle) {
    let child = app.state::<Api>().0.lock().unwrap().take();
    if let Some(mut child) = child {
        // SIGTERM so uvicorn shuts down cleanly (SQLite WAL, running tasks)
        let _ = Command::new("kill").arg(child.id().to_string()).status();
        let _ = child.wait();
        if let Ok(data) = app.path().app_data_dir() {
            let _ = fs::remove_file(data.join("api.pid"));
        }
    }
}

fn running(app: &AppHandle) -> bool {
    let api = app.state::<Api>();
    let mut guard = api.0.lock().unwrap();
    guard.as_mut().is_some_and(|c| matches!(c.try_wait(), Ok(None)))
}

fn toggle_api(app: &AppHandle) {
    if running(app) {
        return stop_api(app);
    }
    match start_api(app) {
        Ok(child) => *app.state::<Api>().0.lock().unwrap() = Some(child),
        Err(e) => eprintln!("cliper: failed to start API: {e}"),
    }
}

fn healthy() -> bool {
    let addr = ([127, 0, 0, 1], PORT).into();
    let Ok(mut s) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else {
        return false;
    };
    let _ = s.set_read_timeout(Some(Duration::from_secs(2)));
    if s.write_all(b"GET /healthz HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n").is_err() {
        return false;
    }
    let mut buf = [0u8; 12];
    matches!(s.read(&mut buf), Ok(n) if n == 12 && &buf[9..12] == b"200")
}

/// Built in code, not from config alone: <a download> is cancelled unless a handler exists.
/// wry already saves to ~/Downloads without overwriting; we just reveal the file.
fn create_main(app: &AppHandle) -> tauri::Result<()> {
    let mut config = app.config().app.windows[0].clone();
    if !cfg!(debug_assertions) {
        // Load the page from the API, not tauri://localhost: media URLs are relative /storage/...
        // and <a download> needs same origin. Dev gets the same through the Vite proxy.
        config.url = WebviewUrl::External(format!("http://127.0.0.1:{PORT}").parse().unwrap());
    }
    WebviewWindowBuilder::from_config(app, &config)?
        // Google login runs in the system browser: the webview has no back button and window.open is null
        .on_navigation(|url| {
            if url.host_str() == Some("accounts.google.com") {
                let _ = Command::new("open").arg(url.as_str()).status();
                return false;
            }
            true
        })
        // target="_blank" links (YouTube Studio, docs): wry drops them unless handled
        .on_new_window(|url, _| {
            // window.open("") from the YouTube flow arrives as about:blank: deny it, the page then redirects
            if matches!(url.scheme(), "http" | "https") {
                let _ = Command::new("open").arg(url.as_str()).status();
            }
            NewWindowResponse::Deny
        })
        .on_download(|_, event| {
            if let DownloadEvent::Finished { path: Some(path), success: true, .. } = event {
                let _ = Command::new("open").arg("-R").arg(path).status();
            }
            true
        })
        .build()?;
    Ok(())
}

/// Dock icon + Cmd+Tab only while the window is open; tray-only otherwise.
/// An Accessory app also can't take focus, so Open would leave the window behind others.
fn set_dock(app: &AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(if visible {
        tauri::ActivationPolicy::Regular
    } else {
        tauri::ActivationPolicy::Accessory
    });
}

fn show_main(app: &AppHandle) {
    if app.get_webview_window("main").is_none() {
        if let Err(e) = create_main(app) {
            eprintln!("cliper: failed to open window: {e}");
        }
    }
    if let Some(w) = app.get_webview_window("main") {
        set_dock(app, true);
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn main() {
    let app = tauri::Builder::default()
        // Must be the first plugin: a second launch just brings up the running instance
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![HIDDEN_ARG])))
        .manage(Api(Mutex::new(None)))
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let status = MenuItem::with_id(app, "status", "○ Starting…", false, None::<&str>)?;
            let toggle = MenuItem::with_id(app, "toggle", "Stop API", true, None::<&str>)?;
            let open = MenuItem::with_id(app, "open", "Open Cliper Pro", true, None::<&str>)?;
            // Where users drop BGM tracks (bgm/<mood>/*.mp3): they are not bundled, the license covers use, not redistribution
            let data = MenuItem::with_id(app, "data", "Open Data Folder", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&status, &toggle, &open, &data, &sep, &quit])?;
            // Release only: in dev the login item would point at target/debug
            if !cfg!(debug_assertions) {
                let on = app.autolaunch().is_enabled().unwrap_or(false);
                let login = CheckMenuItem::with_id(app, "autostart", "Start at Login", true, on, None::<&str>)?;
                menu.insert(&login, 4)?;
            }

            let mut tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip(&app.package_info().name);
            // Dev and the installed app often run side by side: label dev's icon in the menu bar
            if cfg!(debug_assertions) {
                tray = tray.title("DEV");
            }
            tray
                .menu(&menu)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "open" => show_main(app),
                    "toggle" => toggle_api(app),
                    "data" => {
                        if let Ok(dir) = app.path().app_data_dir() {
                            let _ = fs::create_dir_all(dir.join("bgm"));
                            let _ = Command::new("open").arg(dir).status();
                        }
                    }
                    "autostart" => {
                        let launch = app.autolaunch();
                        let res = if launch.is_enabled().unwrap_or(false) { launch.disable() } else { launch.enable() };
                        if let Err(e) = res {
                            eprintln!("cliper: failed to change login item: {e}");
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            toggle_api(app.handle());

            let handle = app.handle().clone();
            let hidden = std::env::args().any(|a| a == HIDDEN_ARG);
            std::thread::spawn(move || {
                // Create the window only once the API answers, so the page's first fetches don't fail
                let mut shown = false;
                loop {
                    let up = healthy();
                    if up && !shown {
                        if !hidden {
                            show_main(&handle);
                        }
                        shown = true;
                    }
                    let _ = status.set_text(if up { "● API running" } else { "○ API stopped" });
                    let _ = toggle.set_text(if running(&handle) { "Stop API" } else { "Start API" });
                    std::thread::sleep(Duration::from_millis(if shown { 3000 } else { 300 }));
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window keeps the app (and API) alive in the tray
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                set_dock(window.app_handle(), false);
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build Cliper Pro");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            stop_api(app);
        }
    });
}
