# Checkpoints — REMAKE v0.7 (personagem modular)

Ficheiro de recuperação de contexto (diretiva §9). Antes de continuar trabalho após perda de contexto:
ler o **último checkpoint**, a diretiva (`docs/MODULAR_CHARACTER_DIRECTIVE.md`) e o plano
(`docs/REMAKE_v07_PLAN.md`).

Estados de componente: IMPLEMENTADO · TESTADO · APROVADO · PENDENTE (implementado ≠ aprovado).
Estados de evidência: FACT · OBSERVED · MEASURED · INFERRED · HYPOTHESIS · UNKNOWN.

---

## CP-000 — Linha de base (antes do remake)
- Commit `64b3ff7` (v0.6 etapa 2 + seletor de rig no preview). v0.5 continua a ser o renderer por omissão.
- Veredicto do utilizador (OBSERVED): braços OK "por enquanto", transição do pescoço gostou; cabelo com
  contornos brancos e movimento mau, contornos na cabeça, casaco divide-se; "falta método".
- **MEASURED nesta sessão** (`tools/v07_edge_audit.py`, anel exterior da silhueta composto sobre fundo
  escuro): as camadas v0.6 têm cor de fundo cozida nas bordas — `hair_puff` 3105 px do anel com L>80
  (máx. L 245, quase branco), `head_base` 909 px (máx. 244), tendrils 47–56 % do anel claro.
  → causa-raiz dos "contornos brancos" = **contaminação do matte** (cor do fundo claro nas bordas),
  não o renderer. Será corrigido nos componentes v0.7 (não se remenda o v0.6).

---

## CP-001 — Corpo-base (frente) · **IMPLEMENTADO · TESTADO (gates abaixo) · aguarda APROVADO**

### Decisão
- Fonte = **gen_d** (`art_v07/base/base_body_gen_d.png`, md5 `9a603e02…`), aprovado pelo utilizador como
  "caminho certo". Processado **deterministicamente** (sem gerar imagens novas):
  `python3 tools/v07_body_base.py` (2 execuções → mesmo md5 `78ba54e9…`, MEASURED).
- **Sem regeneração**: o corpo aprovado é preservado pixel a pixel na anatomia; muda só matte, cor da pele
  (mapeada ao canon), nariz (extraído para componente) e roupa interior (pedida pelo utilizador).
- Cobertura = **bandeau sem alças + cueca, castanho-escuro opaco e fino** (proposta do utilizador).
  Braços, pernas e pescoço ficam pele. Nada de fato/collants (REJEITADO).

### Saídas
| Ficheiro | Conteúdo |
|---|---|
| `art_v07/base/body_base_front_v1.png` | corpo-base RGBA 319×990 (alfa reto, bordas descontaminadas) |
| `art_v07/face/nose_v1.png` | componente FACE/Nose 24×24 RGBA |
| `app/public/rig_v07/{body_base_front.png, nose.png, manifest.json, metrics.json, canon_compare.jpg}` | cópia para o preview |
| `art_v07/evidence/cp001_*` | fundos, bordas 4× em escuro, comparação canon, nariz 8×, métricas |
| `app/public/v07/base.html` | visualizador no preview (botão "v0.7 · CP-001 corpo base →") |

### Gates (MEASURED, `art_v07/evidence/cp001_metrics.json`)
| Gate | Resultado |
|---|---|
| Contorno claro: anel exterior com L>80 sobre fundo escuro | **0 / 2567 px → PASS** (máx. L 71; 113 px entre 60–71 = anti-aliasing escuro da linha) |
| Buracos de alfa no interior | **0 → PASS** |
| Borda sobre escuro/branco/cinza mais clara que max(F, fundo) +4 | 0 / 3379 px nos três fundos |
| Borda média sobre escuro: recorte ingénuo → limpo | 58.5 → 26.5 (a contaminação removida) |
| Pele mediana vs canon pose_01 | (148,74,52) vs (150,76,52) |
| Componente nariz: base+nariz vs original | erro médio 0.68, máx. 5.9 (sem nariz: máx. 52) |
| Proporções vs folha canon (queixo→sola = 1000) | ombros 290 vs ≈285 · largura ombros 243 vs ≈245 · cintura 470 vs ≈470 · umbigo 520 vs ≈505 · virilha 660 vs ≈660 |
| Regressão v0.5/v0.6 | selftest 47/47 PASS · `npm run build` OK · tsc OK |

### Defeitos encontrados e corrigidos durante o CP-001 (registo honesto)
1. Bandeau por cima do braço direito (assumi fundo entre braço e tronco; o braço toca o seio).
2. Cueca por cima dos antebraços → recorte à região da pélvis (flood entre as fendas de fundo).
3. Buraco de alfa no rosto (realce do nariz L≈114 tratado como borda) → alfa só no anel junto à transparência.
4. Pontilhado claro na silhueta (pixels linha+fundo com L<110 tratados como sólidos) → v3: desmistura só no
   anel exterior, dois candidatos (linha/pele) escolhidos pelo erro de reconstrução. A métrica antiga
   não o detetava (só via pixels semitransparentes) → criada `tools/v07_edge_audit.py` (independente).
5. Fita de pele + degrau no lado esquerdo do bandeau (detetor de linha apanhava a faixa de sombra).
6. Escada + cunhas de pele no lado direito → limites laterais **derivados das linhas reais** por linha de
   píxeis (linha braço/tronco; braço direito interior; fenda de fundo), linha original mantida a 100 %.

### Limitações / pendente (não esconder)
- Só a **frente**. A vista de costas do gen_d não foi processada (CP-001b).
- **Sem rig** neste corpo: esqueleto, pesos, máscaras de articulação = checkpoints seguintes.
- A borda direita do bandeau segue a linha do braço píxel a píxel (visível como ligeiro degrau a 5×; a
  1–2× lê-se como linha). Pode ser refinada com vetorização da linha se o utilizador pedir.
- Estilo: corpo-base em cel-shading plano (2 tons); a arte canon do rosto (pose_01) é pintada. A
  integração rosto↔corpo é uma decisão do CP-002 (ver plano).
- Orelhas continuam desenhadas no corpo-base; separá-las como componente fica para o CP-002.

### Próxima ação
Aguardar **APROVADO / correções** do utilizador ao CP-001. Depois: CP-002 cabeça-base + elementos dos olhos.
