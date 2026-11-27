// Watches the mouse system-wide (a low-level mouse hook in a hidden PowerShell process) and reports:
//   down  x y         left button pressed (used to close the wheel when clicking elsewhere)
//   drag  x y class   the user started dragging with Shift held, in File Explorer or on the desktop
//   up    x y         left button released
// Coordinates are physical screen pixels; convert with screen.screenToDipPoint.
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Windows.Forms @"
using System;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class FlickHook {
  delegate IntPtr Proc(int code, IntPtr wParam, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
  [StructLayout(LayoutKind.Sequential)] struct MSLL { public POINT pt; public uint data, flags, time; public IntPtr extra; }
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Proc fn, IntPtr mod, uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);

  static Proc keep; // stop the delegate being garbage collected
  static bool down, fired;
  static int sx, sy;

  static string RootClass(IntPtr h) {
    var root = GetAncestor(h, 2);
    var sb = new StringBuilder(128);
    GetClassName(root == IntPtr.Zero ? h : root, sb, 128);
    return sb.ToString();
  }
  static void Say(string s) { Console.Out.WriteLine(s); Console.Out.Flush(); }

  static IntPtr OnMouse(int code, IntPtr w, IntPtr l) {
    if (code >= 0) {
      var m = (MSLL)Marshal.PtrToStructure(l, typeof(MSLL));
      int msg = w.ToInt32();
      if (msg == 0x201) { // WM_LBUTTONDOWN
        down = true; fired = false; sx = m.pt.x; sy = m.pt.y;
        Say("down " + m.pt.x + " " + m.pt.y);
      } else if (msg == 0x200 && down && !fired) { // WM_MOUSEMOVE while held
        int dx = m.pt.x - sx, dy = m.pt.y - sy;
        if (dx * dx + dy * dy > 100 && (GetAsyncKeyState(0x10) & 0x8000) != 0) {
          var start = new POINT { x = sx, y = sy };
          string cls = RootClass(WindowFromPoint(start));
          if (cls == "CabinetWClass" || cls == "ExploreWClass" || cls == "Progman" || cls == "WorkerW") {
            fired = true;
            Say("drag " + m.pt.x + " " + m.pt.y + " " + cls);
          }
        }
      } else if (msg == 0x202 && down) { // WM_LBUTTONUP
        down = false;
        Say("up " + m.pt.x + " " + m.pt.y);
      }
    }
    return CallNextHookEx(IntPtr.Zero, code, w, l);
  }

  public static void Run() {
    SetProcessDpiAwarenessContext(new IntPtr(-4)); // per-monitor v2: physical pixels
    keep = OnMouse;
    var h = SetWindowsHookEx(14, keep, GetModuleHandle(null), 0); // WH_MOUSE_LL
    if (h == IntPtr.Zero) { Say("error hook"); return; }
    Say("ready");
    Application.Run();
  }
}
"@
[FlickHook]::Run()
`;

class Hook extends EventEmitter {
  start() {
    if (this.proc) return;
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buf = '';
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const parts = buf.slice(0, nl).trim().split(' ');
        buf = buf.slice(nl + 1);
        const [type, x, y, cls] = parts;
        if (type === 'ready') this.emit('ready');
        else if (type === 'down' || type === 'up' || type === 'drag') this.emit(type, { x: Number(x), y: Number(y), cls });
        else if (type === 'error') this.emit('failed');
      }
    });
    this.proc.stderr.on('data', (d) => this.emit('log', d.toString()));
    this.proc.on('exit', () => {
      this.proc = null;
      // restart if it dies unexpectedly (unless we stopped it)
      if (!this.stopping) setTimeout(() => this.start(), 2000);
    });
  }
  stop() {
    this.stopping = true;
    if (this.proc) this.proc.kill();
  }
}

module.exports = new Hook();
