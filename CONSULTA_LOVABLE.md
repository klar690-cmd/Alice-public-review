# Alice — guia para consulta no Lovable

Este repositório público contém o projeto completo da Alice no checkpoint R271 / M3g, incluindo a Alice clássica, Alice V2, frontend React/TypeScript, backend Rust/Tauri, testes, temas, artes, documentação e evidências. É uma cópia para consulta autorizada pelo proprietário; a linha de desenvolvimento original continua separada.

## Comece por aqui

- [src/App.tsx](src/App.tsx): shell real da aplicação.
- [src/components/AliceV2](src/components/AliceV2): editor visual, configurações por agente e interface V2.
- [src/lib/aliceV2](src/lib/aliceV2): grafos, validações, segurança, protocolos e coordenação offline.
- [src-tauri](src-tauri): motor original e integrações nativas.
- [docs/alice/v2/m3g/RESULT.md](docs/alice/v2/m3g/RESULT.md): resultado mais recente e limites.
- [docs/alice/v2/m3g/PREVIEWS.md](docs/alice/v2/m3g/PREVIEWS.md): capturas reais da interface.
- [docs/alice/v2/m3g/OPEN_IN_BROWSER.md](docs/alice/v2/m3g/OPEN_IN_BROWSER.md): instruções da versão no navegador.
- [SOURCE_MANIFEST.json](SOURCE_MANIFEST.json): todos os 1280 arquivos originais com seus hashes Git.

## Prévia e execução

O arquivo [docs/alice/v2/m3g/Alice-V2-preview.html](docs/alice/v2/m3g/Alice-V2-preview.html) contém a prévia offline funcional. Baixe o arquivo e abra no navegador. Ele usa o frontend real com transporte de demonstração, sem autenticações reais ou execução nativa. Para a versão local servida, consulte as instruções e o launcher no diretório m3g. Não basta servir index.html sem suas dependências.

A versão Windows depende de Rust/MSVC/Tauri. A publicação não confirma compilação nativa nem disponibiliza EXE/MSI. A validação frontend R271 registrada foi de 446 testes e 27 verificações de interação no Chrome; esses resultados são anteriores a esta cópia, que não altera o código funcional.

## Limite da integração Lovable

A documentação oficial consultada em 2026-10-10 informa que o Git sync do Lovable não importa repositórios GitHub existentes automaticamente: https://docs.lovable.dev/integrations/github#limitations . Esta publicação permite acesso público ao código para análise e download; não afirma que o Lovable já carregou ou sincronizou o projeto. A aplicação inclui componentes desktop que não podem executar em um ambiente web comum.

Sugestão de mensagem para enviar ao Lovable:

> Analise o código completo em https://github.com/klar690-cmd/Alice-public-review. Comece por CONSULTA_LOVABLE.md e SOURCE_MANIFEST.json e examine o frontend src/, motor src-tauri/, contratos src/lib/aliceV2/ e documentação docs/alice/v2/. Preserve a Home, arte de perfil, animação ASCII, temas, editor de nós e controles de painéis aprovados. Quero primeiro uma análise do projeto e das adaptações necessárias para seu ambiente. Informe se não conseguir ler algum arquivo. Não substitua o projeto por uma tela genérica e não conecte agentes, APIs, n8n nem autenticações reais.

## Proveniência e segurança

Snapshot funcional: 7c61693a0345252996a7f4f6ed673e639ce14fb0. Snapshot completo de evidências: 1828a67391f90877e739bf1ee868bbba80d85a7b. Nenhum commit anterior é incluído nesta cópia. Todos os arquivos rastreados desse snapshot são preservados, exceto a introdução documental acrescentada ao README. Arquivos pessoais não rastreados, credenciais, caches e dependências locais não são parte da publicação. A verificação de nomes e padrões comuns de segredos não encontrou ocorrências; ela não substitui uma auditoria completa de segurança.

GitHub Actions deve permanecer desativado neste repositório de consulta. Nenhum workflow, serviço pago, agente real ou integração foi executado para publicá-lo.

Alice deriva de Alethe sob AGPL-3.0-or-later. LICENSE, NOTICE e UPSTREAM.md permanecem intactos. A referência histórica à preservação do Git upstream em UPSTREAM.md descreve o repositório original; esta cópia pública tem somente um commit inicial com o snapshot completo e os avisos de licença.
