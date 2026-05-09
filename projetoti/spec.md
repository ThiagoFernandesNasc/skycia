# SPEC - Base de Dados Focada no Usuário (LGPD)

Este documento define a base SPEC para a Sky CIA, derivada do banco operacional (sistema_voos), com foco em dados pessoais, consentimento e experiência do usuário.

## 1) Tabelas principais

### usuario
- id_usuario (PK)
- nome
- email (único)
- senha_hash
- perfil (OPERADOR | ADMIN | PASSAGEIRO)
- canal_preferido (EMAIL | SMS | WHATSAPP)
- criado_em
- atualizado_em

### consentimento
- id (PK)
- usuario_id (FK usuario)
- tipo (OPERACIONAL | IA_PREDITIVA | IA_GENERATIVA | RELATORIOS | AUDITORIA)
- concedido
- data_hora

### log_acesso_dado
- id (PK)
- usuario_id (FK usuario)
- acao
- entidade
- detalhes
- data_hora

### usuario_seguranca
- usuario_id (PK/FK usuario)
- two_factor_enabled
- atualizado_em

### sessao_usuario
- id (PK)
- usuario_id (FK usuario)
- jti
- user_agent
- ip
- ativa
- criado_em
- revogada_em

### solicitacao_lgpd
- id (PK)
- usuario_id (FK usuario)
- tipo (EXPORTACAO | EXCLUSAO)
- status
- detalhes
- criado_em

## 2) Regras LGPD
- Base legal: consentimento explícito para alertas personalizados.
- Finalidade: uso exclusivo para monitoramento e comunicação de risco.
- Minimização: coletar apenas dados necessários para alertas e personalização.
- Retenção: dados pessoais devem ser removidos após período definido na política interna.
- Direitos do titular: acesso, correção, portabilidade e exclusão.

## 3) Integração com banco operacional
- O banco operacional (sistema_voos) mantém dados de voo e status.
- A SPEC armazena interações, preferências e histórico de risco.
- O relacionamento é lógico via numero_voo e não por FK direta.
