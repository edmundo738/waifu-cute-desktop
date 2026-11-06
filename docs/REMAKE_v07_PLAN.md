# REMAKE v0.7 — plano de trabalho (personagem modular)

Diretiva: `docs/MODULAR_CHARACTER_DIRECTIVE.md` (vinculativa). Estado por checkpoint: `docs/CHECKPOINTS.md`.
Princípio: **uma anatomia-base, componentes independentes, articulações coerentes, movimentos
coordenados, identidade visual preservada.** A canon (3 folhas em `references/`) é a fonte de verdade.

## 1. Árvore de componentes (alvo)
```
CHARACTER
├─ BODY_BASE            CP-001 frente ✅ implementado · costas pendente (CP-001b)
│   Head_Base · Neck · Torso · Pelvis · Arms(Upper/Fore) · Hands · Legs · Feet
├─ FACE                 CP-002 / CP-003
│   Ears · Nose ✅(componente extraído) · Eyes(Eyeball, Iris, Pupil, Lids, Lashes) · Brows · Mouth(+elementos)
├─ HAIR                 CP-004   Back (secundário amplo) · Middle (quase fixo, colado) · Front (médio→máx.)
├─ CLOTHING             CP-005   Top · Jacket(Back, Front L/R, Sleeves, Shoulders, Cuffs, Collar, Zips) · Cargo · Shoes
├─ ACCESSORIES          CP-006   Earrings · Necklace · Bracelets · Rings
├─ SKELETON             (pertence ao corpo; roupa/acessórios ligam-se por pontos de fixação)
└─ ANIMATION / PHYSICS  CP-007   olhar L/R, piscar, inclinar, acenar, respirar, mudar postura, reação ao clique, curiosidade
```
Dados por componente (manifest): id, textura, transform, origem/pivô, ligação (bone), hierarquia,
máscara, ordem de desenho (pode depender da pose), limites, parâmetros de animação e de física, estado.

## 2. Pipeline de arte (o que o CP-001 provou)
1. Fonte aprovada pelo utilizador → **processamento determinístico** (script versionado, mesmo md5).
2. Matte com fundo conhecido: desmistura **só no anel exterior** (entre transparência e a linha escura);
   cor de borda = cor de primeiro plano (sem cor de fundo) → sem contornos brancos.
3. Gate independente `tools/v07_edge_audit.py` em **todas** as camadas novas: anel L>80 sobre escuro = 0,
   buracos de alfa = 0. (As camadas v0.6 falham este gate — é a causa medida dos contornos brancos.)
4. Paleta mapeada ao canon (pose_01) para que componentes cortados da arte canon encaixem.
5. Elementos que mudam (nariz, olhos, boca…) saem para camadas próprias com origem no manifest; o
   corpo-base fica limpo por baixo (sem "fantasmas" do elemento antigo).
6. Evidência: fundos claro/escuro/transparente/cor, zoom 4×, comparação canon, métricas JSON.

## 3. Checkpoints seguintes (propostos — cada um espera aprovação antes do seguinte)
| CP | Conteúdo | Teste de aceitação (§16) |
|---|---|---|
| CP-001b | costas do corpo-base (mesmo método) | fundos/zoom/gates; alinhamento frente↔costas |
| CP-002 | cabeça-base careca + orelhas como componentes + **olhos e elementos** (globo, íris, pupila, pálpebras-máscara, pestanas, sobrancelhas) | olhar segue rato dentro de limites, piscar, sem contornos; cabeça frente/inclinações |
| CP-003 | boca e elementos (melhorar os existentes: AEIOU meio-termo, sorriso) + nariz canon | fala (tecla Y), visemas reais, enquadramento no rosto |
| CP-004 | cabelo em 3 níveis com pivôs/malhas por madeixa | parado, em movimento, paragem repentina, cada nível e combinados; sem halos |
| CP-005 | roupa separada do corpo (top, casaco por peças, cargo, ténis) com pontos de fixação e zonas de sobreposição | mangas/ombros/cotovelos sem rasgar; trocar uniforme sem refazer o corpo |
| CP-006 | acessórios (brincos, colar, pulseiras) | ligados ao bone certo; sem flutuar |
| CP-007 | integração + biblioteca de movimentos reutilizáveis + profundidade (paralaxe, 2.5D, oclusão) | todos os testes visuais; desempenho ≤16 ms |

Decisões em aberto (para perguntar no CP-002, não decidir sozinho): estilo do rosto (cel plano como o
corpo-base vs pintado como a arte canon nas bordas dos componentes); orelhas separadas ou no crânio.

## 4. Papéis ("agentes")
Não existem sub-agentes reais neste ambiente: os papéis são executados **sequencialmente** pelo mesmo
assistente, cada um com entregáveis verificáveis — Anatomia (proporções medidas vs canon), Arte/camadas
(matte, máscaras, gates de borda), Arquitetura (manifest, hierarquia, ordem de desenho), Animação
(bones, limites, física), Testes (gates automáticos + evidência visual registada).

## 5. Tecnologias
Avaliação anterior em `docs/ANIMATION_ENGINE_EVALUATION.md` (Live2D = alvo de produção maduro;
Inochi2D = alternativa livre ainda em beta; motor próprio leve implementado). Para o v0.7 a verificação
atualizada de estado/licença/distribuição de Live2D, Inochi2D, Spine e DragonBones está **PENDENTE**
(a fazer antes de escolher o formato de rig do CP-007). Nenhuma dependência externa obrigatória.

## 6. Experiências falhadas (não repetir)
- Gerar o corpo-base com o gerador de imagens: prompts "sem roupa/manequim/boneca" → falha de moderação
  (3/3); "fato justo cor de pele" → 1 sucesso em 5 (= gen_d); gen_d como entrada → falha; pose_01 como
  entrada → falha (causa UNKNOWN). O gerador copia o layout da 1.ª imagem (folha inteira, texto "108 cm"
  errado).
- **Fato/collants cinzentos (gen_i/gen_j) — REJEITADO pelo utilizador** ("nunca mais"). Erro de processo:
  inventei uma alternativa visual em vez de explicar a limitação e propor. Ficheiros e a ferramenta de
  composição associada (`v07_mirror_input.py`) foram removidos.
- Gate de halo que só olha para pixels semitransparentes: não deteta bordas opacas contaminadas → usar
  `tools/v07_edge_audit.py`.
- Limites laterais "a olho" em curvas quase horizontais → derivar dos píxeis reais da linha.
