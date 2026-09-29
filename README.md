# CBRdoc · publicação automática do feed

Artes dos carrosséis (`artes/`), PDFs para o LinkedIn (`pdf/`) e a agenda (`agenda.json`).
O GitHub Actions (`.github/workflows/publicar.yml`) roda todo dia às 10h (São Paulo) e publica o post do dia:

- **Instagram:** carrossel com as 6 imagens e a legenda.
- **LinkedIn:** documento PDF na página da empresa, com a mesma legenda.

Sem as chaves configuradas, ele só **simula** (nada é publicado). Cada publicação fica registrada em `publicados.json`, então um post nunca sai duas vezes.

## Configuração (uma vez)

Em **Settings → Secrets and variables → Actions → New repository secret**:

| Segredo | O que é |
|---|---|
| `IG_USER_ID` | Opcional: o robô descobre sozinho a partir do token |
| `IG_ACCESS_TOKEN` | Token da Meta com `instagram_content_publish` (de preferência de um usuário do sistema do Business Manager, que não expira) |
| `LINKEDIN_ORG_ID` | ID numérico da página da CBRdoc no LinkedIn |
| `LINKEDIN_ACCESS_TOKEN` | Token do LinkedIn com `w_organization_social` |

## Testar

Aba **Actions → Publicar post do dia → Run workflow**, informando uma data (ex.: `2026-10-02`).
