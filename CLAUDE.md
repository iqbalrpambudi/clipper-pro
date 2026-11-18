# Cliper Pro

## Branching

| Branch | Isi | Dibuat dari | Merge ke |
|---|---|---|---|
| `main` | Kode rilis. Tiap rilis diberi tag `v*` | - | - |
| `development` | Integrasi, base semua kerjaan baru | - | `main` saat rilis |
| `feat/<nama>` | Fitur baru | `development` | `development` |
| `fix/<nama>` | Bug fix | `development` | `development` |
| `refactor/`, `chore/`, `docs/` `<nama>` | Non-fitur | `development` | `development` |
| `hotfix/<nama>` | Bug darurat di rilis | `main` | `main` + `development` |

`<nama>` pakai kebab-case pendek, mis. `feat/bgm-autoduck`, `fix/llm-gateway-retry`.

### Aturan

- Jangan commit langsung ke `main` atau `development`. Kalau sedang di salah satunya, buat branch dulu.
- Satu branch untuk satu fitur atau fix. Jangan campur dengan perubahan lain.
- Pesan commit pakai Conventional Commits: `feat(scope): ...`, `fix(scope): ...`, `refactor`, `style`, `chore`, `docs`, `perf`, `test`.
- Sebelum merge, `make test` dan `make lint` harus lulus.
- Merge pakai `--no-ff`, supaya satu fitur bisa di-revert dengan satu commit.
- Hapus branch setelah merge.
- Jangan force push ke `main` atau `development`.

### Fitur / bug fix

```bash
git checkout development && git pull
git checkout -b feat/<nama>          # atau fix/<nama>
# ... kerja + commit ...
make test && make lint
git checkout development && git pull
git merge --no-ff feat/<nama>
git push origin development
git branch -d feat/<nama>
```

### Rilis

```bash
git checkout main && git pull
git merge --no-ff development
cliper-pro export --version X.Y.Z         # bump versi + lint/test + build ./dist/
git commit -am "chore(release): vX.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z"     # bukan --tag dari export: itu men-tag sebelum bump di-commit
git push origin main vX.Y.Z               # tag v* memicu .github/workflows/release.yml
git checkout development && git merge main && git push origin development
```

### Hotfix

```bash
git checkout main && git checkout -b hotfix/<nama>
# ... fix + commit, make test ...
git checkout main && git merge --no-ff hotfix/<nama>
git checkout development && git merge --no-ff hotfix/<nama>
git branch -d hotfix/<nama>
```

Setelah itu rilis patch (`X.Y.Z+1`) seperti langkah Rilis.
