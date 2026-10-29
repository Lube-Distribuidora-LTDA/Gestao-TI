param(
    [switch]$JaElevado,
    [string]$Origem,
    [string]$Destino = "C:\BI\GESTAO_TI",
    [string]$Usuario
)

# instalar_e_agendar.ps1
#
# Instala o agente da Rotina 750 do GESTAO TI numa pasta local e cria a tarefa
# agendada que, de hora em hora, le os lancamentos de contas a pagar no WinThor e
# marca as faturas como "Lancada no WinThor" no painel. Sem abrir janela.
# (Adaptado do instalador do BI Compras - mesmas armadilhas, mesmas defesas.)
#
# Como rodar (uma vez so):
#   cd "P:\INTEGRACAO BI\GESTAO TI"
#   powershell -ExecutionPolicy Bypass -File .\instalar_e_agendar.ps1
#
# QUAL CONTA VAI RODAR A TAREFA
# Este script roda em duas partes: a primeira na sua janela normal, a segunda
# numa janela elevada. E ai mora a armadilha que nos custou varias tentativas:
# quando o UAC pede credencial de administrador, a janela elevada e de OUTRA
# conta (LUBE\Administrador). Uma tarefa registrada para ela nunca roda, porque
# essa conta nunca esta logada - o Agendador aciona e recusa na hora.
# Por isso a Parte 1 anota o SEU usuario e passa adiante: a tarefa e sempre
# registrada para quem abriu o script, nao para quem elevou.
#
# COMO ELE ESCOLHE O MODO DE LOGON
# Em vez de supor qual modo a politica da maquina aceita, ele registra uma
# tarefa-cobaia que so escreve um arquivo, dispara, e ve se o arquivo aparece.
# Testa em ordem de preferencia:
#   1. Senha guardada - roda mesmo com voce deslogado;
#   2. S4U            - roda deslogado tambem, sem guardar senha;
#   3. Interativo     - roda so quando voce estiver logado no Windows.
# Fica com o primeiro que realmente disparou.
#
# POR QUE INSTALAR EM C:\ E NAO NA PASTA DE REDE
# A tarefa roda numa sessao que nao tem o drive P: mapeado e pode nao alcancar
# o \\servidor. A pasta de rede continua sendo onde voce edita; esta copia local
# e so o que a maquina executa.
#
# SE VOCE MUDAR ALGUM SCRIPT NA PASTA DE REDE, RODE ESTE ARQUIVO DE NOVO.

$ErrorActionPreference = "Stop"

$ARQUIVOS = @(
    "sync_winthor_750.py", "executar.py", "_teste_agendador.py",
    "requirements.txt", "ENV"
)

$NOME_TAREFA = "Gestao TI - Rotina 750"
$NOME_COBAIA = "Gestao TI - teste de agendamento"

function Pausar {
    Write-Host ""
    Write-Host "Pressione ENTER para fechar esta janela..." -ForegroundColor Cyan
    try { Read-Host | Out-Null } catch { Start-Sleep -Seconds 60 }
}

function Traduzir-Resultado {
    param($Codigo)
    switch ($Codigo) {
        0          { "concluiu sem erro" }
        1          { "rodou e terminou com erro - veja o log" }
        2          { "nao chegou a rodar (arquivo nao encontrado ou tarefa recusada)" }
        267009     { "ainda rodando" }
        267011     { "ainda nao rodou" }
        267014     { "foi interrompida" }
        2147942401 { "nao encontrou o pythonw.exe" }
        2147942402 { "nao encontrou o arquivo ou a pasta" }
        2147943726 { "usuario ou senha incorretos" }
        2147943785 { "a conta nao tem o direito de 'logon como tarefa em lote'" }
        2147944309 { "a conta nao tem o direito de 'logon como tarefa em lote'" }
        default    { "codigo $Codigo" }
    }
}

$pastaLocal = $PSScriptRoot
if (-not $pastaLocal) { $pastaLocal = (Get-Location).Path }

$identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
$ehAdmin = (New-Object Security.Principal.WindowsPrincipal($identidade)).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)

# ===========================================================================
# PARTE 1 - sua janela normal: copia os arquivos e anota QUEM e voce
# ===========================================================================

if (-not $JaElevado) {

    if (-not $Origem) { $Origem = $pastaLocal }
    $Usuario = "$env:USERDOMAIN\$env:USERNAME"

    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host " INSTALAR E AGENDAR - Gestao TI, agente da Rotina 750" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Origem  : $Origem"
    Write-Host "Destino : $Destino"
    Write-Host "Usuario : $Usuario  <- a tarefa vai rodar com esta conta" -ForegroundColor Green
    Write-Host ""

    $faltando = @()
    foreach ($a in $ARQUIVOS) {
        if (-not (Test-Path -LiteralPath (Join-Path $Origem $a))) { $faltando += $a }
    }
    if ($faltando -contains "ENV") {
        throw "Nao encontrei o arquivo ENV em $Origem. Ele guarda as credenciais e e obrigatorio."
    }
    if ($faltando.Count -gt 0) {
        throw ("Faltam arquivos em ${Origem}: " + ($faltando -join ", "))
    }

    New-Item -ItemType Directory -Force -Path $Destino | Out-Null
    foreach ($a in $ARQUIVOS) {
        Copy-Item -LiteralPath (Join-Path $Origem $a) -Destination (Join-Path $Destino $a) -Force
        Write-Host ("  copiado  " + $a) -ForegroundColor Green
    }
    Write-Host ""
    Write-Host "ETL instalado em $Destino" -ForegroundColor Green

    if (-not $ehAdmin) {
        $euElevado = Join-Path $Destino "instalar_e_agendar.ps1"
        Copy-Item -LiteralPath $PSCommandPath -Destination $euElevado -Force

        $linhaManual = 'powershell -ExecutionPolicy Bypass -NoExit -File "' + $euElevado +
                       '" -JaElevado -Destino "' + $Destino + '" -Usuario "' + $Usuario + '"'

        Write-Host ""
        Write-Host "Agora preciso de administrador para criar as tarefas." -ForegroundColor Yellow
        Write-Host "A janela elevada pode ser de outra conta - tudo bem, ela ja sabe que" -ForegroundColor Yellow
        Write-Host "a tarefa e para o $Usuario." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Se ela nao abrir, cole esta linha num PowerShell como administrador:"
        Write-Host ("   " + $linhaManual) -ForegroundColor White
        Write-Host ""

        try {
            Start-Process powershell.exe -Verb RunAs -ErrorAction Stop -ArgumentList @(
                "-ExecutionPolicy", "Bypass", "-NoExit",
                "-File", "`"$euElevado`"", "-JaElevado",
                "-Destino", "`"$Destino`"", "-Usuario", "`"$Usuario`""
            )
            Write-Host "Janela elevada aberta. Acompanhe por la." -ForegroundColor Green
        } catch {
            Write-Host "Nao consegui elevar: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "Use a linha acima." -ForegroundColor Yellow
        }
        Write-Host ""
        exit 0
    }
}

# ===========================================================================
# PARTE 2 - janela elevada: escolhe o modo que funciona e cria as tarefas
# ===========================================================================

try {
    if (-not $ehAdmin) { throw "Continuo sem privilegio de administrador." }
    if (-not $Usuario) { $Usuario = "$env:USERDOMAIN\$env:USERNAME" }
    $euAgora = "$env:USERDOMAIN\$env:USERNAME"

    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host " JANELA ELEVADA - escolhendo o modo e criando as tarefas" -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Pasta de execucao : $Destino"
    Write-Host "Tarefa vai rodar como : $Usuario" -ForegroundColor Green
    if ($euAgora -ne $Usuario) {
        Write-Host "Esta janela e do $euAgora, mas a tarefa NAO vai usar essa conta -" -ForegroundColor DarkGray
        Write-Host "foi exatamente esse o erro da tentativa anterior." -ForegroundColor DarkGray
    }

    $bootstrap = Join-Path $Destino "executar.py"
    $cobaia    = Join-Path $Destino "_teste_agendador.py"
    $alvo      = Join-Path $Destino "sync_winthor_750.py"
    foreach ($f in @($bootstrap, $cobaia, $alvo)) {
        if (-not (Test-Path -LiteralPath $f)) {
            throw "Nao encontrei $f. A copia para a pasta local nao aconteceu."
        }
    }

    # --- achar o Python -----------------------------------------------------
    $python = $null
    $c = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($c) { $python = $c.Source }
    if (-not $python) {
        $cw = Get-Command pythonw.exe -ErrorAction SilentlyContinue
        if ($cw) {
            $cand = Join-Path (Split-Path $cw.Source) "python.exe"
            if (Test-Path -LiteralPath $cand) { $python = $cand }
        }
    }
    if (-not $python) {
        throw "Nao encontrei o python.exe. Instale o Python marcando 'Add Python to PATH'."
    }
    $pythonw = Join-Path (Split-Path $python) "pythonw.exe"
    if (-not (Test-Path -LiteralPath $pythonw)) {
        throw "Achei o python.exe em $python mas nao o pythonw.exe ao lado dele."
    }
    Write-Host ""
    Write-Host "Python sem tela   : $pythonw"

    Write-Host ""
    Write-Host "Conferindo as bibliotecas do ETL..."
    $teste = & $python -c "import oracledb; print('BIBLIOTECAS OK')" 2>&1
    $saidaTeste = ($teste | Out-String).Trim()
    if ($saidaTeste -match "BIBLIOTECAS OK") {
        Write-Host "  [ok] oracledb disponivel" -ForegroundColor Green
    } else {
        Write-Host "  [X] FALTA BIBLIOTECA." -ForegroundColor Red
        Write-Host $saidaTeste -ForegroundColor Red
        Write-Host ""
        Write-Host "Instale e rode este script de novo:" -ForegroundColor Yellow
        Write-Host ("   " + $python + " -m pip install -r `"" + (Join-Path $Destino "requirements.txt") + "`"") -ForegroundColor White
        Pausar
        exit 1
    }

    $config = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
        -MultipleInstances IgnoreNew `
        -Hidden

    # --- a senha e opcional: sem ela, pulamos direto para o S4U -------------
    Write-Host ""
    Write-Host "Vai abrir uma caixa pedindo a senha do Windows DE $Usuario." -ForegroundColor Cyan
    Write-Host "Nao e a senha do Administrador - e a sua, a que voce usa para entrar" -ForegroundColor Cyan
    Write-Host "no Windows. Ela permite a tarefa rodar com voce deslogado." -ForegroundColor Cyan
    Write-Host "Se preferir, pode cancelar: eu tento os outros modos." -ForegroundColor DarkGray

    $senha = $null
    try {
        $cred = Get-Credential -Message "Senha do Windows de $Usuario" -UserName $Usuario
        if ($cred) { $senha = $cred.GetNetworkCredential().Password }
    } catch {
        Write-Host "  (caixa de senha cancelada)" -ForegroundColor DarkGray
    }

    # --- registrar uma tarefa num modo -------------------------------------
    function Registrar {
        param($Nome, $Argumento, $Horarios, $Descricao, $Modo)

        $acao = New-ScheduledTaskAction -Execute $pythonw -Argument $Argumento -WorkingDirectory $Destino
        $gatilhos = foreach ($h in $Horarios) { New-ScheduledTaskTrigger -Daily -At (Get-Date $h) }

        if ($Modo -eq "Senha") {
            Register-ScheduledTask -TaskName $Nome -Action $acao -Trigger $gatilhos `
                -Settings $config -User $Usuario -Password $senha `
                -Description $Descricao -Force | Out-Null
        } else {
            $p = New-ScheduledTaskPrincipal -UserId $Usuario -LogonType $Modo -RunLevel Limited
            Register-ScheduledTask -TaskName $Nome -Action $acao -Trigger $gatilhos `
                -Settings $config -Principal $p -Description $Descricao -Force | Out-Null
        }
    }

    # --- a cobaia: prova se o modo realmente dispara um processo ------------
    $marca = Join-Path $Destino "_teste_agendador.txt"

    function Testar-Modo {
        param($Modo)

        if (Test-Path -LiteralPath $marca) { Remove-Item -LiteralPath $marca -Force }

        try {
            Registrar -Nome $NOME_COBAIA -Argumento ('"' + $cobaia + '"') `
                -Horarios @("23:59") -Descricao "Temporaria: testa o agendamento do Gestao TI." -Modo $Modo
        } catch {
            Write-Host ("    registro recusado: " + $_.Exception.Message) -ForegroundColor DarkGray
            return $false
        }

        try { Start-ScheduledTask -TaskName $NOME_COBAIA } catch {
            Write-Host ("    nao consegui disparar: " + $_.Exception.Message) -ForegroundColor DarkGray
            return $false
        }

        $fim = (Get-Date).AddSeconds(45)
        while ((Get-Date) -lt $fim) {
            Start-Sleep -Seconds 2
            Write-Host -NoNewline "."
            if (Test-Path -LiteralPath $marca) { return $true }
        }
        return $false
    }

    $modos = @(
        @{ nome = "Senha";       rotulo = "senha guardada"; texto = "roda mesmo com voce deslogado" },
        @{ nome = "S4U";         rotulo = "S4U";            texto = "roda mesmo com voce deslogado, sem guardar senha" },
        @{ nome = "Interactive"; rotulo = "interativo";     texto = "roda somente quando voce estiver logado no Windows" }
    )

    Write-Host ""
    Write-Host "Testando os modos de agendamento com uma tarefa-cobaia..." -ForegroundColor Cyan
    Write-Host "(ela so escreve um arquivinho - nao toca no banco)" -ForegroundColor DarkGray

    $modoBom = $null
    foreach ($m in $modos) {
        if ($m.nome -eq "Senha" -and -not $senha) {
            Write-Host ("  - " + $m.rotulo + ": pulado (sem senha)") -ForegroundColor DarkGray
            continue
        }
        Write-Host -NoNewline ("  - " + $m.rotulo + " ")
        if (Testar-Modo -Modo $m.nome) {
            Write-Host " FUNCIONOU" -ForegroundColor Green
            $modoBom = $m
            break
        }
        Write-Host " nao disparou" -ForegroundColor Yellow
    }

    try { Unregister-ScheduledTask -TaskName $NOME_COBAIA -Confirm:$false -ErrorAction SilentlyContinue } catch { }
    if (Test-Path -LiteralPath $marca) { Remove-Item -LiteralPath $marca -Force -ErrorAction SilentlyContinue }

    if (-not $modoBom) {
        Write-Host ""
        Write-Host "NENHUM MODO CONSEGUIU INICIAR UM PROCESSO." -ForegroundColor Red
        Write-Host "Isso ja nao e configuracao de script: a politica desta maquina bloqueia"
        Write-Host "a conta $Usuario de rodar tarefa agendada. Quem resolve e o TI, dando"
        Write-Host "a ela o direito 'Fazer logon como tarefa em lote' na politica local"
        Write-Host "(secpol.msc > Diretivas locais > Atribuicao de direitos de usuario)."
        Pausar
        exit 1
    }

    # --- criar a tarefa de verdade, no modo que passou --------------------
    # de hora em hora, aos :25 - nao colide com o COMPRAS (:50) nem com o FISCAL (:10/:40)
    $horarios = @("07:25", "08:25", "09:25", "10:25", "11:25", "12:25", "13:25",
                  "14:25", "15:25", "16:25", "17:25", "18:25", "19:25")

    Write-Host ""
    Write-Host "Criando a tarefa no modo que passou..."

    Registrar -Nome $NOME_TAREFA -Argumento ('"' + $bootstrap + '"') `
        -Horarios $horarios -Modo $modoBom.nome `
        -Descricao "Gestao TI: le a PCLANC (Rotina 750) e marca as faturas lancadas no WinThor."
    Write-Host "  [ok] $NOME_TAREFA" -ForegroundColor Green

    # --- carga de teste de verdade -----------------------------------------
    $log   = Join-Path $Destino "sync_winthor_750.log"
    $falha = Join-Path $Destino "falha_inicial.log"
    if (Test-Path -LiteralPath $falha) { Remove-Item -LiteralPath $falha -Force }
    $antes = if (Test-Path -LiteralPath $log) { (Get-Item -LiteralPath $log).Length } else { -1 }

    Write-Host ""
    Write-Host "Disparando uma rodada de verdade agora (leva segundos)..." -ForegroundColor Cyan
    Start-ScheduledTask -TaskName $NOME_TAREFA

    # Sai assim que houver prova de vida (log cresceu ou falhou), sem esperar o
    # estado "Running": uma carga muito rapida pode comecar e terminar entre
    # duas leituras, e ai o laco ficaria oito minutos parado a toa.
    $limite = (Get-Date).AddMinutes(8)
    $viuRodando = $false
    Write-Host -NoNewline "Aguardando"
    while ((Get-Date) -lt $limite) {
        Start-Sleep -Seconds 3
        Write-Host -NoNewline "."
        if (Test-Path -LiteralPath $falha) { break }
        $agora = if (Test-Path -LiteralPath $log) { (Get-Item -LiteralPath $log).Length } else { -1 }
        $estado = (Get-ScheduledTask -TaskName $NOME_TAREFA).State
        if ($estado -eq "Running") { $viuRodando = $true; continue }
        if ($viuRodando -or $agora -gt $antes) { break }
    }
    Write-Host ""

    $info = Get-ScheduledTask -TaskName $NOME_TAREFA | Get-ScheduledTaskInfo
    Write-Host ""
    Write-Host ("Resultado : " + (Traduzir-Resultado $info.LastTaskResult)) -ForegroundColor $(
        if ($info.LastTaskResult -eq 0) { "Green" } else { "Yellow" })

    $depois = if (Test-Path -LiteralPath $log) { (Get-Item -LiteralPath $log).Length } else { -1 }

    Write-Host ""
    if ($depois -gt $antes) {
        Write-Host "O PYTHON RODOU - o log cresceu." -ForegroundColor Green
        Write-Host ""
        Get-Content -LiteralPath $log -Tail 18 | ForEach-Object {
            $cor = if ($_ -match "\[ERROR\]|FALHOU|Traceback") { "Red" }
                   elseif ($_ -match "\[WARNING\]") { "Yellow" } else { "Gray" }
            Write-Host "  $_" -ForegroundColor $cor
        }
    } elseif (Test-Path -LiteralPath $falha) {
        Write-Host "O Python comecou e quebrou antes do log. Motivo:" -ForegroundColor Yellow
        Get-Content -LiteralPath $falha | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    } else {
        Write-Host "A cobaia disparou mas a carga nao escreveu no log." -ForegroundColor Yellow
        Write-Host "Confira em $log daqui a alguns minutos - ela pode estar em andamento."
    }

    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "  conta que executa   : $Usuario"
    Write-Host "  modo                : $($modoBom.texto)"
    Write-Host "  horarios            : $($horarios -join ', ')"
    Write-Host "  pasta de execucao   : $Destino"
    Write-Host "================================================================" -ForegroundColor Cyan
    if ($modoBom.nome -eq "Interactive") {
        Write-Host ""
        Write-Host "ATENCAO: neste modo a tarefa so roda se voce deixar o Windows logado" -ForegroundColor Yellow
        Write-Host "(pode bloquear a tela, mas nao deslogar)." -ForegroundColor Yellow
    }

} catch {
    Write-Host ""
    Write-Host "FALHOU: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Linha: $($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor DarkGray
}

Pausar
