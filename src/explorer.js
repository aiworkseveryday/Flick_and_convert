// Reads the files selected in the foreground File Explorer window.
// A single PowerShell process stays alive so each query takes milliseconds.
// The bubble window is non-focusable, so Explorer is still the foreground window when it is pressed.
const { spawn } = require('child_process');

const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System; using System.Runtime.InteropServices;
public class FlickFg { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }
"@
$sh = New-Object -ComObject Shell.Application
[Console]::Out.WriteLine('READY'); [Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $fg = [FlickFg]::GetForegroundWindow().ToInt64()
  $result = @()
  foreach ($w in $sh.Windows()) {
    if ($result.Count -gt 0) { break }
    if ($w.HWND -ne $fg) { continue }
    $items = @()
    foreach ($i in $w.Document.SelectedItems()) { if ($i.Path) { $items += [string]$i.Path } }
    if ($items.Count -gt 0) { $result = $items }
  }
  [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject @($result)))
  [Console]::Out.Flush()
}
`;

let proc = null;
let buffer = '';
let ready = false;
const waiting = [];

function start() {
  if (proc) return;
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      if (line === 'READY') {
        ready = true;
        continue;
      }
      const resolve = waiting.shift();
      if (!resolve) continue;
      try {
        const parsed = JSON.parse(line);
        resolve(Array.isArray(parsed) ? parsed.filter(Boolean) : parsed ? [parsed] : []);
      } catch {
        resolve([]);
      }
    }
  });
  proc.on('exit', () => {
    proc = null;
    ready = false;
    while (waiting.length) waiting.shift()([]);
  });
}

function getSelection() {
  if (!proc) start();
  return new Promise((resolve) => {
    // On timeout, resolve empty but leave the entry queued so a late reply
    // is consumed by it instead of being handed to the next query.
    const timer = setTimeout(() => resolve([]), ready ? 1500 : 4000);
    function done(v) {
      clearTimeout(timer);
      resolve(v);
    }
    waiting.push(done);
    proc.stdin.write('q\n');
  });
}

function stop() {
  if (proc) proc.kill();
}

module.exports = { start, stop, getSelection };
