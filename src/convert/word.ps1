# Converts with the installed Microsoft Word (no window shown).
# Env: FLICK_IN, FLICK_OUT, FLICK_MODE = pdf | docx
$ErrorActionPreference = 'Stop'
$in = $env:FLICK_IN
$out = $env:FLICK_OUT
$mode = $env:FLICK_MODE

$before = @(Get-Process WINWORD -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
try {
  $word = New-Object -ComObject Word.Application
} catch {
  [Console]::Error.WriteLine('Microsoft Word is not installed')
  exit 2
}
# Tell Flick which Word process is ours, so it can end it if Word hangs or the user presses Stop.
foreach ($p in Get-Process WINWORD -ErrorAction SilentlyContinue) {
  if ($before -notcontains $p.Id) { [Console]::Out.WriteLine("PID $($p.Id)"); [Console]::Out.Flush() }
}
$word.Visible = $false
$word.DisplayAlerts = 0   # wdAlertsNone: no "Word will now convert your PDF" prompt
$doc = $null
try {
  # FileName, ConfirmConversions, ReadOnly, AddToRecentFiles, PasswordDocument
  # A dummy password makes a protected file fail fast instead of waiting on a hidden prompt.
  $doc = $word.Documents.Open($in, $false, $true, $false, 'flick-no-password')
  if ($mode -eq 'pdf') {
    $doc.ExportAsFixedFormat($out, 17)   # wdExportFormatPDF
  } else {
    $doc.SaveAs2($out, 16)               # wdFormatDocumentDefault (.docx)
  }
  [Console]::Out.WriteLine('OK')
} catch {
  $msg = $_.Exception.Message
  if ($msg -match 'password') { $msg = 'This document is password protected' }
  [Console]::Error.WriteLine($msg)
  exit 1
} finally {
  if ($doc) { $doc.Close([ref]0) }   # wdDoNotSaveChanges
  $word.Quit([ref]0)
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
