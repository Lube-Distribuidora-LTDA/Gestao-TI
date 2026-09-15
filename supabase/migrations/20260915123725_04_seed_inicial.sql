-- =====================================================
-- Migration 04: Dados iniciais
-- =====================================================

insert into public.categorias_custo (nome, descricao, cor, icone, ordem) values
  ('Links e Internet',    'Links dedicados, banda larga, MPLS e redundancia',        '#2563EB', 'Wifi',        1),
  ('Telefonia',           'Telefonia fixa, movel, VoIP e ramais',                    '#0EA5E9', 'Phone',       2),
  ('Licencas de Software','Office, antivirus, ERP, assinaturas e SaaS',              '#7C3AED', 'KeyRound',    3),
  ('Nuvem e Hospedagem',  'Servidores cloud, backup, hospedagem de sites e e-mail',  '#059669', 'Cloud',       4),
  ('Hardware',            'Computadores, perifericos, servidores e impressoras',     '#EA580C', 'HardDrive',   5),
  ('Manutencao e Suporte','Contratos de suporte tecnico e manutencao de equipamentos','#DC2626','Wrench',      6),
  ('Seguranca',           'Firewall, certificados digitais e ferramentas de seguranca','#BE123C','ShieldCheck', 7),
  ('Outros',              'Demais despesas do departamento de TI',                   '#64748B', 'Package',     8)
on conflict (nome) do nothing;

insert into public.configuracoes (chave, valor, descricao) values
  ('empresa_nome',            'Lube Distribuidora',        'Nome exibido nos e-mails e cabecalhos'),
  ('ti_email_remetente',      'cpd@lube.com.br',           'Endereco usado para enviar cobrancas e respostas'),
  ('ti_responsavel',          'Departamento de TI',        'Assinatura padrao dos e-mails'),
  ('cobranca_ativa_global',   'true',                      'Liga/desliga o robo de cobranca automatica'),
  ('leitura_email_ativa',     'true',                      'Liga/desliga a leitura automatica do webmail'),
  ('imap_pasta',              'INBOX',                     'Pasta do webmail que o robo varre'),
  ('imap_dias_retroativos',   '7',                         'Quantos dias para tras o robo varre a cada execucao'),
  ('notificar_chamado_email', 'true',                      'Envia e-mail ao solicitante quando o chamado e respondido')
on conflict (chave) do nothing;
;