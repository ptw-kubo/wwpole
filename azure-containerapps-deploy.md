# Azure Container Apps デプロイメモ

## 方針

この実装では、アンケートHTMLをContainer Appsから配信し、回答送信時に `/api/responses` がAzure Blob Storageへ1回答ごとにJSONとCSVを保存する。

ローカル実行時に `AZURE_STORAGE_ACCOUNT_NAME` を設定しない場合は、検証用に `data/responses` へ保存する。Azure本番ではBlob Storageを使う。

## 保存先

Azure上の保存先は以下。

```text
Storage Account: <任意のストレージアカウント名>
Blob Container: survey-responses
JSON Blob Path: YYYY-MM-DD/json/<received_at>_<response_id>.json
CSV Blob Path: YYYY-MM-DD/csv/<received_at>_<response_id>.csv
```

回答者PCにもJSON/CSVをダウンロードできる補助出力を残している。Azure側では監査・正本用にJSON、集計・Excel/Power BI用にCSVを保存する。

## 会社別URLと回答コード

Container AppsのURLは1つだが、会社別に `company` クエリを付けたURLを配布する。

```text
https://<container-app-fqdn>/?company=jp-hq-7kx92
https://<container-app-fqdn>/?company=th-company-q3m8a
```

各社担当者は社員へ回答コードを配布する。回答時には会社コードと回答コードの組み合わせをサーバー側でハッシュ化し、保存済みJSONに同じ組み合わせがある場合は再回答を拒否する。生の回答コードはBlobへ保存しない。

## 必要なAzureリソース

- Subscription ID: `0f4a98a5-c6ea-4c90-90e9-9c105c22750c`
- Resource Group: `rg-dev-wwpole`
- Azure Container Apps
- Azure Container Registry
- Azure Storage Account
- Blob Container: `survey-responses`
- Container AppのSystem-assigned managed identity
- Storage Accountへの `Storage Blob Data Contributor` ロール割り当て

## 環境変数

Container Appに設定する。

| 変数 | 値 |
|---|---|
| `PORT` | `8080` |
| `AZURE_STORAGE_ACCOUNT_NAME` | 作成したStorage Account名 |
| `AZURE_STORAGE_CONTAINER_NAME` | `survey-responses` |

## Azure CLI 実行例

名前は環境に合わせて変更する。

```powershell
az account set --subscription 0f4a98a5-c6ea-4c90-90e9-9c105c22750c

$rg = "rg-dev-wwpole"
$location = "japaneast" # 必要に応じて変更すること
$acr = "acrwwpoledev001" # 必要に応じて一意な名前に変更すること
$storage = "stwwpolesurvey001" # 必要に応じて一意な名前に変更すること
$container = "survey-responses"
$env = "cae-wwpole-dev"
$app = "ca-global-ai-readiness-survey"
$image = "$acr.azurecr.io/global-ai-readiness-survey:latest"

az storage account create `
  --resource-group $rg `
  --name $storage `
  --location $location `
  --sku Standard_LRS `
  --kind StorageV2

az storage container create `
  --account-name $storage `
  --name $container `
  --auth-mode login

az acr create `
  --resource-group $rg `
  --name $acr `
  --sku Basic

az acr build `
  --registry $acr `
  --image global-ai-readiness-survey:latest `
  .

az containerapp env create `
  --resource-group $rg `
  --name $env `
  --location $location

az containerapp create `
  --resource-group $rg `
  --name $app `
  --environment $env `
  --image $image `
  --target-port 8080 `
  --ingress external `
  --registry-server "$acr.azurecr.io" `
  --system-assigned `
  --env-vars `
    PORT=8080 `
    AZURE_STORAGE_ACCOUNT_NAME=$storage `
    AZURE_STORAGE_CONTAINER_NAME=$container

$principalId = az containerapp show `
  --resource-group $rg `
  --name $app `
  --query identity.principalId `
  --output tsv

$storageId = az storage account show `
  --resource-group $rg `
  --name $storage `
  --query id `
  --output tsv

az role assignment create `
  --assignee $principalId `
  --role "Storage Blob Data Contributor" `
  --scope $storageId
```

## 動作確認

```powershell
$url = az containerapp show `
  --resource-group rg-dev-wwpole `
  --name ca-global-ai-readiness-survey `
  --query properties.configuration.ingress.fqdn `
  --output tsv

Invoke-RestMethod "https://$url/healthz"
```

画面から回答を送信した後、Blobを確認する。

```powershell
az storage blob list `
  --account-name stwwpolesurvey001 `
  --container-name survey-responses `
  --prefix 2026-05-21/csv/ `
  --auth-mode login `
  --output table
```

## 注意

- Blobへ保存されるJSONには、回答本文、受信日時、回答ID、User-Agent、`x-forwarded-for` が含まれる。
- 生回答データにはAI利用実態やリスク情報が含まれるため、Storage AccountとContainer Appの権限は最小限にする。
- Container Appsのコンテナ内ファイルは正本保存先にしない。
- 二重回答は、保存済みJSON内の会社コードと回答コードハッシュを確認して防止する。ブラウザにも送信済み状態を保存し、同じ会社コードと回答コードでの再送信を画面上でも抑止する。
