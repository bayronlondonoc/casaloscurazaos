param(
  [string]$Src,
  [string]$Dst,
  [int]$MaxWidth = 1800,
  [int]$Quality = 82,
  [string]$Prefix = ""
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Dst)) {
  New-Item -ItemType Directory -Path $Dst -Force | Out-Null
}

$jpgCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)

$files = Get-ChildItem -Path $Src -File | Where-Object { $_.Extension -match '\.(jpg|jpeg|png|JPG|JPEG|PNG)$' }
$count = 0
$total = $files.Count

foreach ($file in $files) {
  $count++
  try {
    $img = [System.Drawing.Image]::FromFile($file.FullName)

    $w = $img.Width
    $h = $img.Height
    if ($w -gt $MaxWidth) {
      $ratio = $MaxWidth / $w
      $newW = $MaxWidth
      $newH = [int]($h * $ratio)
    } else {
      $newW = $w
      $newH = $h
    }

    $bmp = New-Object System.Drawing.Bitmap $newW, $newH
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($img, 0, 0, $newW, $newH)

    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name).ToLower() -replace '[^a-z0-9]+', '-' -replace '^-+|-+$', ''
    $outName = if ($Prefix) { "$Prefix-$baseName.jpg" } else { "$baseName.jpg" }
    $outPath = Join-Path $Dst $outName

    $bmp.Save($outPath, $jpgCodec, $encoderParams)
    $g.Dispose()
    $bmp.Dispose()
    $img.Dispose()

    $newSize = [math]::Round((Get-Item $outPath).Length / 1KB, 1)
    Write-Host "[$count/$total] $outName ${newW}x${newH} ${newSize}KB"
  } catch {
    Write-Host "ERROR $($file.Name) - $_"
  }
}

Write-Host "Done. $count files processed."
