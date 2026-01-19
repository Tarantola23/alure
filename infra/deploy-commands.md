# Deploy commands

## Firebase Hosting (dashboard)

```bash
cd dashboard
npm install
npm run build
cd ..
firebase use acquired-badge-484316-u4
firebase deploy --only hosting
```

## Cloud Run (server)

```bash
gcloud config set project acquired-badge-484316-u4
gcloud builds submit --tag gcr.io/acquired-badge-484316-u4/alure-api .
gcloud run deploy alure-api \
  --image gcr.io/acquired-badge-484316-u4/alure-api \
  --region europe-west1 \
  --platform managed \
  --allow-unauthenticated \
  --env-vars-file infra/cloudrun-env.yaml
```

### Env vars (Cloud Run)
- Generate the file from `server/.env` (PowerShell):

```powershell
$envFile = "server/.env"
$outFile = "infra/cloudrun-env.yaml"
$lines = Get-Content $envFile | Where-Object { $_ -and $_ -notmatch '^\s*#' }
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
  "$($_.Name): ""$($_.Value.Replace('"','\"'))"""
}
$yaml | Set-Content $outFile -NoNewline
```

- Update `server/.env` and regenerate `infra/cloudrun-env.yaml` when values change.
