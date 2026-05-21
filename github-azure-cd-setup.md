# GitHub Actions から Azure Container Apps へCDする設定

## 対象

- GitHub repository: `masayukick/wwpole`
- Azure subscription: `0f4a98a5-c6ea-4c90-90e9-9c105c22750c`
- Resource group: `rg-dev-wwpole`
- Workflow: `.github/workflows/azure-containerapps-cd.yml`

## 1. GitHubに設定する値

GitHub repositoryの `Settings > Secrets and variables > Actions` に設定する。

### Secrets

| Secret | 内容 |
|---|---|
| `AZURE_CLIENT_ID` | OIDC用のEntraアプリケーション、またはユーザー割り当てManaged IdentityのClient ID |
| `AZURE_TENANT_ID` | Azure tenant ID |

`AZURE_SUBSCRIPTION_ID` はworkflow内に固定値として入れているためSecret化していない。

### Variables

| Variable | 例 | 条件 |
|---|---|---|
| `AZURE_ACR_NAME` | `acrwwpoledev001` | Azure全体で一意なACR名 |
| `AZURE_STORAGE_ACCOUNT_NAME` | `stwwpolesurvey001` | Azure全体で一意、小文字英数字、3〜24文字 |

## 2. OIDC認証の作成例

GitHub ActionsからAzureへログインするため、Entra ID側にFederated Credentialを作る。

```powershell
az account set --subscription 0f4a98a5-c6ea-4c90-90e9-9c105c22750c

$appName = "github-wwpole-containerapps-cd"
$repoSubject = "repo:masayukick/wwpole:ref:refs/heads/main"

$appId = az ad app create `
  --display-name $appName `
  --query appId `
  --output tsv

az ad sp create --id $appId

$subscriptionId = "0f4a98a5-c6ea-4c90-90e9-9c105c22750c"
$rg = "rg-dev-wwpole"
$scope = "/subscriptions/$subscriptionId/resourceGroups/$rg"

az role assignment create `
  --assignee $appId `
  --role Contributor `
  --scope $scope

# Container AppのManaged IdentityへStorage Blob Data Contributorを付与するために必要。
# 権限運用上、手動でロール付与する場合はこのRole Based Access Control Administratorは不要。
az role assignment create `
  --assignee $appId `
  --role "Role Based Access Control Administrator" `
  --scope $scope

$credential = @{
  name = "github-main"
  issuer = "https://token.actions.githubusercontent.com"
  subject = $repoSubject
  audiences = @("api://AzureADTokenExchange")
} | ConvertTo-Json -Compress

$credential | Out-File -FilePath .\github-federated-credential.json -Encoding utf8

az ad app federated-credential create `
  --id $appId `
  --parameters .\github-federated-credential.json
```

GitHub Secretには以下を設定する。

```text
AZURE_CLIENT_ID = $appId
AZURE_TENANT_ID = az account show --query tenantId --output tsv の値
```

PowerShellで値を表示する例。

```powershell
"AZURE_CLIENT_ID=$appId"
"AZURE_TENANT_ID=$(az account show --query tenantId --output tsv)"
```

GitHub画面での設定先:

```text
https://github.com/masayukick/wwpole/settings/secrets/actions
```

`AZURE_CLIENT_ID` と `AZURE_TENANT_ID` は必ず `Secrets` に作成する。`Variables` に作成しても `azure/login` には渡らない。

`AZURE_ACR_NAME` と `AZURE_STORAGE_ACCOUNT_NAME` は以下に `Variables` として作成する。

```text
https://github.com/masayukick/wwpole/settings/variables/actions
```

## 2.1 よくあるエラー

### `Not all values are present. Ensure 'client-id' and 'tenant-id' are supplied.`

原因:

- GitHub Actions Secret `AZURE_CLIENT_ID` が未設定
- GitHub Actions Secret `AZURE_TENANT_ID` が未設定
- Secret名のスペルが違う
- Repository SecretではなくEnvironment Secretにだけ作成している
- SecretではなくVariableに作成している

対処:

1. `Settings > Secrets and variables > Actions > Secrets` を開く。
2. `AZURE_CLIENT_ID` と `AZURE_TENANT_ID` がRepository secretsに存在することを確認する。
3. なければ上記のPowerShell出力値を登録する。
4. Actionsを再実行する。

## 3. Push後の流れ

`main` ブランチにpushすると以下を実行する。

1. `npm ci`
2. Playwright Chromiumインストール
3. `npm run test:all`
4. AzureへOIDCログイン
5. ACR、Storage Account、Blob Container、Container Apps Environmentを確認・なければ作成
6. DockerfileからイメージをビルドしてACRへpush
7. Azure Container Appsへデプロイ
8. Container AppのSystem-assigned Managed IdentityへBlob書き込み権限を付与
9. デプロイURLをActionsログに表示

## 4. 回答データ保存先

```text
Storage Account: GitHub variable AZURE_STORAGE_ACCOUNT_NAME
Blob Container: survey-responses
JSON Blob Path: json/YYYY-MM-DD/<received_at>_<response_id>.json
CSV Blob Path: csv/YYYY-MM-DD/<received_at>_<response_id>.csv
```

## 5. 注意

- `Role Based Access Control Administrator` をGitHub Actions用IDに付けたくない場合は、初回だけ手動でContainer AppのManaged Identityに `Storage Blob Data Contributor` を付与し、workflowの `Assign storage role to Container App identity` stepを削除または無効化する。
- GitHub Actionsの認証はClient SecretではなくOIDCを使う。Secretにクライアントシークレットを置かない。
- 本番回答データはBlobにJSONとCSVの両方を保存する。JSONは監査・正本用、CSVは集計・Excel/Power BI用として扱う。
- 二重回答防止は同一ブラウザ/端末を対象にする。厳密な同一人物判定が必要な場合は、Container Appsの認証またはEntra ID連携を追加する。
