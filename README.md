# Abafiladeatendimento

Crie um aplicativo web responsivo (Mobile-First) de gestão de filas e controle de senhas para a ONG **ABA (Amigos Barretenses dos Animais)**, de Barretos-SP. O visual deve ser acolhedor, limpo, moderno e acessível, usando tons de azul-petróleo, verde-suave e branco, com ícones relacionados a cuidados veterinários (cães e gatos).

O sistema deve funcionar inteiramente em Português (Brasil) e ter dois fluxos principais: **Área do Tutor/Cidadão** (acessada via QR Code no local) e **Painel da Equipe/Recepção** (protegido por login).

### 1. Fluxo do Tutor / Cidadão (Entrada via QR Code)
Ao abrir o link principal (simulando a leitura do QR Code na recepção da ABA), o usuário passa pelas seguintes etapas:

* **Tela de Boas-Vindas e Cadastro Obrigatório:**
  * Cabeçalho com o nome da ONG: "ABA - Amigos Barretenses dos Animais" e subtítulo "Atendimento Veterinário, Castração e Vacinação".
  * Formulário obrigatório antes de gerar a senha, contendo:
    * **Dados do Tutor:** Nome completo, CPF (com máscara e validação de formato), Telefone/WhatsApp, Endereço completo (CEP, Rua, Número, Bairro - Barretos/SP).
    * **Upload de Documento:** Campo obrigatório para anexar foto ou PDF de um documento oficial com foto (RG ou CNH), com opção de tirar foto direto pela câmera do celular (`accept="image/*"` com `capture="environment"`) ou escolher arquivo da galeria, exibindo uma pré-visualização antes de enviar.
    * **Dados do Animal e Serviço:** Nome do animal, Espécie (Cão ou Gato), e Tipo de Atendimento (Consulta Veterinária, Castração Agendada, Vacinação - Parvovirose/Cinomose, ou Pós-operatório/Retorno).
    * **Checkbox de Declaração:** "Declaro que as informações são verdadeiras e que resido em Barretos-SP."

* **Tela de Acompanhamento da Senha (Tempo Real):**
  * Após concluir o cadastro, o sistema gera uma senha alfanumérica (ex: `VET-014`, `VAC-008`, `CAS-003`) e exibe um cartão em destaque com:
    * **Sua Senha** em fonte grande.
    * **Posição na Fila:** "Há X pessoas na sua frente".
    * **Tempo Médio Estimado:** Cálculo dinâmico baseado no tempo médio por atendimento (ex: ~15 min por pessoa na frente).
    * **Status Atual:** "Aguardando na fila", "É a sua vez! Dirija-se ao guichê/consultório" (com alerta visual em verde pulsante quando chamado) ou "Atendimento Finalizado".
  * Botão para o usuário desistir/cancelar a própria senha caso precise ir embora.

### 2. Painel da Equipe / Atendimento (Área Administrativa)
Crie uma rota `/admin` com tela de login simples (e-mail e senha) para os colaboradores e veterinários da ABA. Dentro do painel:

* **Resumo do Dia (Cards no topo):** Total de atendimentos no dia, pessoas aguardando agora, e tempo médio real de atendimento.
* **Controle de Chamada (Destaque principal):**
  * Botão grande **"Chamar Próxima Senha"** (com opção de filtrar por tipo de serviço ou chamar por ordem de chegada).
  * Exibição da senha que está em atendimento no momento, com botões para **"Finalizar Atendimento"** ou **"Marcar como Não Compareceu"**.
* **Lista da Fila e Conferência de Documentos:**
  * Lista ordenada dos tutores na fila mostrando: Senha, Nome do Tutor, Nome/Espécie do Animal, Serviço e Horário de entrada.
  * Ao clicar em um item da fila, abrir um **Modal de Detalhes** onde a equipe pode visualizar o CPF, endereço completo e **abrir/ampliar a foto do documento anexado** para conferir a identidade antes ou durante o atendimento.
* **Configurações Rápidas e QR Code:**
  * Campo para ajustar o tempo médio estimado por atendimento (padrão: 15 minutos).
  * Uma aba ou botão **"Gerar QR Code da Recepção"** que exibe na tela o QR Code pronto para imprimir (apontando para a URL inicial do app) com a arte da ABA.

### Requisitos Técnicos e Dados Iniciais
* Utilize Supabase (ou estado local bem estruturado inicialmente, pronto para conectar ao Supabase) para gerenciar a fila em tempo real e o armazenamento das fotos dos documentos.
* Popule o sistema com 4 ou 5 cadastros fictícios de exemplo (ex: moradores de bairros de Barretos como Centro, América, Los Angeles) para que eu consiga testar imediatamente a visualização da fila tanto na visão do cidadão quanto no painel `/admin`.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://abafiladeatendimento.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e347188e-1b9f-43dd-b6bd-5f9f913e6e1f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
