# Simple static file server for testing the Daily Planner PWA on your phone.
# Usage: powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080]

param(
    [int]$Port = 8080
)

$root = $PSScriptRoot

$mimeTypes = @{
    ".html" = "text/html"
    ".css"  = "text/css"
    ".js"   = "application/javascript"
    ".json" = "application/json"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".ico"  = "image/x-icon"
}

$ips = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
    Where-Object { $_.AddressFamily -eq 'InterNetwork' } |
    Select-Object -ExpandProperty IPAddressToString

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
$listener.Start()

Write-Host "Serving '$root' on port $Port" -ForegroundColor Green
Write-Host "On this PC:      http://localhost:$Port/"
foreach ($ip in $ips) {
    Write-Host "On your iPhone:  http://$ip`:$Port/   (must be on same Wi-Fi)"
}
Write-Host "`nOn iPhone Safari: open the URL above, tap Share, then 'Add to Home Screen'."
Write-Host "Press Ctrl+C to stop.`n"

while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
        $stream = $client.GetStream()
        $stream.ReadTimeout = 5000
        $stream.WriteTimeout = 5000
        $reader = New-Object System.IO.StreamReader($stream)
        $requestLine = $reader.ReadLine()
        # consume remaining headers
        while (-not [string]::IsNullOrEmpty($reader.ReadLine())) {}

        $path = "/index.html"
        if ($requestLine -match '^\w+\s+(\S+)\s+HTTP') {
            $path = $matches[1]
            if ($path -eq "/") { $path = "/index.html" }
            $path = [System.Uri]::UnescapeDataString($path.Split('?')[0])
        }

        $filePath = Join-Path $root ($path.TrimStart("/"))
        $fullRoot = (Resolve-Path $root).Path
        $resolvedFile = $null
        if (Test-Path $filePath -PathType Leaf) {
            $resolvedFile = (Resolve-Path $filePath).Path
        }

        if ($resolvedFile -and $resolvedFile.StartsWith($fullRoot)) {
            $ext = [System.IO.Path]::GetExtension($resolvedFile).ToLower()
            $contentType = $mimeTypes[$ext]
            if (-not $contentType) { $contentType = "application/octet-stream" }

            $bytes = [System.IO.File]::ReadAllBytes($resolvedFile)
            $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($bytes, 0, $bytes.Length)
        } else {
            $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($body, 0, $body.Length)
        }
        $stream.Flush()
    } catch {
        Write-Host "Request error: $_" -ForegroundColor Yellow
    } finally {
        $client.Close()
    }
}
