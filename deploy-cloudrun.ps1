$ErrorActionPreference = "Stop"

$ProjectId = "acquired-badge-484316-u4"
$ServiceName = "alure-api"
$Region = "europe-west1"
$EnvFile = "server/.env"
$EnvYaml = "infra/cloudrun-env.yaml"

if (!(Test-Path $EnvFile)) {
  throw "Missing $EnvFile"
}

$lines = Get-Content $EnvFile | Where-Object { $_ -and $_ -notmatch '^\s*#' }
$map = @{}
foreach ($line in $lines) {
  $parts = $line -split '=', 2
  $key = $parts[0].Trim()
  $value = $parts[1].Trim()
  if ($value.StartsWith('"') -and $value.EndsWith('"')) { $value = $value.Trim('"') }
  if ($value.StartsWith("'") -and $value.EndsWith("'")) { $value = $value.Trim("'") }
  $map[$key] = $value
}
$yaml = $map.GetEnumerator() | Sort-Object Name | ForEach-Object {
  $value = $_.Value.Replace('"','\"')
  "$($_.Name): ""$value"""
}
($yaml -join "`n") | Set-Content $EnvYaml

gcloud config set project $ProjectId
gcloud builds submit --tag "gcr.io/$ProjectId/$ServiceName" .
gcloud run deploy $ServiceName `
  --image "gcr.io/$ProjectId/$ServiceName" `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --env-vars-file $EnvYaml
