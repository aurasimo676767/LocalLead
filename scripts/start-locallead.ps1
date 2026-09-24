# Starts LocalLead on this PC and opens it in the browser.
# Used by the desktop shortcut: closing this window stops the app.
$root = Split-Path -Parent $PSScriptRoot
$url = "http://localhost:3000"
$Host.UI.RawUI.WindowTitle = "LocalLead (chiudi questa finestra per spegnere l'app)"

if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
  # Already running: just open it.
  Start-Process $url
  exit
}

Write-Host ""
Write-Host "  LocalLead si sta avviando..." -ForegroundColor Cyan
Write-Host "  Il browser si apre da solo appena e' pronto."
Write-Host "  Tieni aperta questa finestra: chiudendola spegni l'app."
Write-Host ""

# Open the browser as soon as the app answers.
Start-Job -ArgumentList $url -ScriptBlock {
  param($u)
  for ($i = 0; $i -lt 120; $i++) {
    try {
      Invoke-WebRequest "$u/login" -UseBasicParsing -TimeoutSec 3 | Out-Null
      Start-Process $u
      return
    } catch {
      Start-Sleep -Seconds 1
    }
  }
} | Out-Null

Set-Location $root
pnpm dev --port 3000
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "  LocalLead si e' fermato con un errore (vedi sopra)." -ForegroundColor Red
  Read-Host "  Premi Invio per chiudere"
}
