# Fixtures de teste — API

## `lei-escaneada-teste.pdf`

PDF simulando documento **escaneado** (página rasterizada, sem camada de texto). Use no painel **Importar** para testar o fluxo OCR:

1. Upload em `/admin/importar`
2. Aguarde o processamento → banner **Ir para revisão OCR**
3. Revise o texto em `/admin/ocr`
4. **Revisar e aprovar** → volta para conferência

Para regenerar:

```bash
node apps/api/scripts/generate-ocr-test-pdf.mjs
```
