NBA logos pack (ready to use)

This pack includes 2 download scripts that save all 30 NBA logos into:
  public/teams/

Files:
- download-nba-logos.ps1   -> run in PowerShell on Windows
- download-nba-logos.mjs   -> run with Node.js

Recommended (Windows PowerShell):
1) Open terminal in your project root (stat2win-web)
2) Run:
   powershell -ExecutionPolicy Bypass -File .\download-nba-logos.ps1

Node alternative:
1) Open terminal in your project root (stat2win-web)
2) Run:
   node .\download-nba-logos.mjs

Expected output folder:
  public/teams/ATL.png
  public/teams/BKN.png
  ...
  public/teams/WAS.png

If you want to render them in Next.js, use:
  import Image from "next/image";
  <Image src={`/teams/${code}.png`} alt={code} width={42} height={42} />
