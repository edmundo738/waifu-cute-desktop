# v0.6 — Diagnóstico e Proposta de Arquitectura: Rig 2D em Camadas com Mesh + Ossos

Estado: **ETAPA 1 IMPLEMENTADA E TESTADA** (auto-rig v06 atrás de `?rig=v06`;
v0.5 continua default até paridade em uso vivo). Etapas 2-5 aguardam sequência.
Este documento cumpre a regra do mandato v0.6: *antes de alterar a arquitectura,
apresentar diagnóstico + proposta + plano de migração*. A implementação da Etapa 1
segue exactamente o §3/§5: `tools/prep_stage1_sheet.py` (base anatómica contínua +
arte oculta reconstruída), `app/src/puppet/mesh/meshRender.ts` (mesh + pesos +
skinning + cadeia Root→Torso→Neck→Head), gates e evidência em
`app/test_out/stage1_poses.png`; medições no relatório
(`docs/IMPLEMENTATION_AND_TEST_REPORT.md`, secção v0.6 Stage 1).

---

## 1. Método usado para o diagnóstico

- Leitura do renderer actual: `app/src/companion/staticRenderer.ts`,
  `app/src/puppet/PuppetRenderer.ts`, `app/src/puppet/mouth/*`,
  `app/public/rig/manifest.json`, `docs/CHARACTER_LAYER_MAP.md`.
- Auditoria de alpha de todos os sprites do rig (numpy) contra a silhueta provada
  (`head_base.png`) e contra palco escuro (`app/test_out/stage_dark.png`).
- Reprodução do bug reportado (imagem-5 do utilizador): guardada em
  `app/test_out/BUG_white_slab_v05.png` (antes) vs `stage_dark.png` (depois).
- Protótipo e testes da matemática alvo (mesh triangular + pesos + skinning):
  `app/src/puppet/mesh/meshMath.ts` + 3 checks no `selftest.node.ts`
  (pesos normalizados; pose de repouso = identidade exacta; dobra de 40° contínua).

## 2. Diagnóstico da arquitectura actual (v0.5.1)

### 2.1 O que existe e funciona (não regressar)
- Canvas 2D único; composição de sprites em espaço-pose com transforms por
  componente: cabeça (rotação/translação em torno do pivô do pescoço), olhos
  (íris em abertura + pálpebra-máscara), sobrancelhas, boca (mandíbula +
  cavidade + camadas), cabelo (lag + sway por mola scalar).
- Estado/UX: máquina de estados, triggers→expressões, tecla Y fala com visemas
  reais (não slideshow), webcam follow (MediaPipe), cérebro LM Studio.
- Testes: 26 checks automáticos + evidências PNG por funcionalidade.

### 2.2 Lacunas estruturais face ao mandato v0.6
| # | Lacuna | Consequência observada |
|---|--------|------------------------|
| G1 | Sem mesh nem skinning: cabeça/pescoço/corpo são sprites separados unidos por remendo (`neck_patch.png`) | Rotação da cabeça limitada a ±4° para não abrir costura; torso não roda; braços não dobram (cada dobra exigiria novo recorte improvisado) |
| G2 | Corpo não é uma estrutura anatómica contínua deformável | Impossível poses de ombro/cotovelo/punho sem recortes novos |
| G3 | Cabelo em 2 planos de overlay + base, sem planos de profundidade nem ancoragem | Sem plano *back* atrás do torso; risk de ecos/bordas duplicadas quando o sway cresce |
| G4 | Arte escondida não reconstruída: variantes geradas como artes paralelas (`head_base_nm.png` = edit "sem boca") | Deriva entre artes paralelas foi a causa do bug da placa branca (§2.3) |
| G5 | Pipeline de recorte ad-hoc por asset (máscaras feather sobre edits opacos) | Classe de bug "fundo brilhante dentro da máscara" (halo/placa) |
| G6 | Roupa/acessórios pintados dentro do sprite do corpo | Não seguem anatomia; não podem acompanhar deformação |
| G7 | Sem ossos/pesos/IK/corrective shapes; molas apenas scalares por overlay | Movimento não controlável por pose; sem reutilização p/ animações novas |

### 2.3 Bug reportado (imagem-5) — causa, correcção, prova
- **Sintoma**: placa branca atrás da cabeça em palco escuro.
- **Causa raiz**: recortes feitos a partir de edits gerados *opacos*: o fundo
  brilhante do edit ficava dentro da máscara feather (invisível no fundo claro
  dos testes antigos; branco em palco escuro). O mesmo atingia a zona da sombra
  de chão em `body_base.png` (pixels semi-transparentes com RGB do fundo).
- **Correcção (v0.5.1, implementada e testada)**: alpha de todo recorte =
  máscara da forma × silhueta provada (`head_base.png`); `head_base_nm.png` com
  alpha = silhueta provada; pixels brilhantes semi-transparentes de fundo
  eliminados em todos os cortes; portas de regressão no selftest
  (`assetLeak=0 composedLeak=0 missing=0`) + evidência `stage_dark.png`
  (palco #171310). Pré-fix: `app/test_out/BUG_white_slab_v05.png`.
- **Nota de canon**: os traços brancos sob os ténis e o rim-light claro nos
  caracóis que se vêem em palco escuro são arte original das folhas de
  referência (não são leak); o gate de alpha confirma leak=0.

## 3. Arquitectura alvo (v0.6)

Princípio: *a personagem comporta-se como um modelo 3D com esqueleto,
representado e renderizado em 2D* — arte contínua + mesh triangular + pesos
suaves + blend linear, no canvas 2D actual (sem trocar de motor).

### 3.1 Pilha de camadas (ordem de profundidade)
1. `hair_back` (plano 3, atrás do torso) — arte oculta reconstruída na prep.
2. `body` anatómico contínuo: cabeça+pescoço+torso+braços+mãos numa só folha,
   com interiores ocultos reconstruídos (axilas, interior do pescoço, costas).
3. `clothes` (cropped top, jacket, cargo trousers, sneakers) = malhas separadas
   pesadas nos mesmos ossos → seguem a anatomia.
4. `head_base` + rosto: olhos (globo em soquete + pálpebras-máscara),
   sobrancelhas, boca (cavidade/dentes/língua/mandíbula no osso Jaw).
5. `hair_mid` (couro/cascalho base) e `hair_front` (puff + tendrils) com
   cadeias de ossos próprias + molas; raízes ancoradas no scalp.

### 3.2 Esqueleto (hierarquia)
```
Root → Torso → Neck → Head → Jaw
                    → EyeSocket_L/R → Eye_L/R
                    → HairFront_1..n / HairMid / HairBack (cadeias c/ mola)
Torso → Clavicle_L/R → UpperArm_L/R → Forearm_L/R → Hand_L/R
```
IK opcional apenas onde ajuda (mão→alvo em poses de aceno); FK por defeito.

### 3.3 Deformação
- Mesh: grelha triangular por região (passo 5–8 px), `buildGridMesh`.
- Pesos: decaimento smoothstep normalizado por vértice (`boneWeights`),
  sem trocas duras → sem dobras em papel; corrective shapes locais
  (comissura labial ao abrir o maxilar, cotovelo em flexão > 90°).
- Skinning: blend linear em torno da raiz do osso (`skinVertices`), protótipo
  já testado (identidade exacta no repouso; continuidade em dobra de 40°).
- Molas: `SecondaryMotion` actual generalizada por cadeia de cabelo/roupa.

### 3.4 Renderer
- Mantém canvas 2D: cada triângulo desenhado por transform affine + clip
  (mapeamento de textura por triângulo) — sem dependências novas.
- PixiJS apenas como acelerador opcional futuro se medições de performance o
  exigirem (regra: medir primeiro; hoje 60 fps folga em canvas 2D p/ ~2–4k tris).

### 3.5 Pipeline de assets (fim dos recortes improvisados)
- Um script único (`tools/cut_rig.py`) deriva todos os cortes da folha-mestre:
  matting por flood-fill da borda (fundo plano) → alpha = matte × silhueta
  canon → recortes por caixa do manifest; edits gerados só para *reconstruir
  arte oculta* nunca como arte paralela visível.
- Gates automáticos por asset: leak de alpha = 0 contra silhueta; evidência
  obrigatória em palco escuro e transparente.

### 3.6 Controlo e compatibilidade
- Pose = vector de ângulos/deslocamentos por osso; triggers/expressões/fala/
  webcam/LM Studio passam a emitir poses (adaptadores finos sobre a API actual:
  `setExpression`, `setSpeech`, gaze, head follow mantêm assinatura).
- Renderer v0.5 mantém-se atrás de flag `rig=v05|v06` até paridade provada
  pelos testes + evidências lado a lado.

## 4. Comparação de ferramentas (livres/abertas)

| Ferramenta | Papel possível | Licença | Headless no sandbox? | Veredicto |
|---|---|---|---|---|
| Live2D Cubism | rig profissional + runtime | SDK grátis p/ dev; editor GUI | Não (editor GUI; core proprietário) | Mantido como alvo de *export*/produção externa (doc ANIMATION_ENGINE_EVALUATION); não dependência obrigatória |
| Inochi2D | rig livre alternativo | BSD-2 | Não (Creator GUI, WIP) | Fallback de licença em 1.0; não agora |
| Godot 2D skeleton | motor completo c/ bones+mesh | MIT | Sim, mas = trocar de motor | Rejeitado agora: reescrita total, sem vantagem concreta p/ companion embeddable em web/Windows |
| Blender | editar arte/mascar pintura | GPL | Sim, mas só como editor de arte externo | Opcional fora do sandbox; não necessário |
| Krita | idem pintura/máscaras | GPL | GUI | Opcional fora do sandbox |
| OpenToonz | pipeline animação raster | BSD | Parcial | Não agrega ao runtime; rejeitado |
| PixiJS | renderer WebGL c/ mesh | MIT | Sim | Opcional futuro só se medição de perf exigir |
| **Custom mesh module (canvas 2D)** | **rig completo in-sandbox** | **própria** | **Sim — protótipo já testado** | **ESCOLHIDO** |

Conclusão: nenhuma ferramenta livre satisfaz *authoring headless + runtime
embeddable* em simultâneo dentro deste sandbox; o módulo próprio sobre o canvas
existente é o caminho com menor risco e sem dependências novas (mandato:
"não inventar um motor inteiro" — não inventamos: é um módulo de skinning
(~150 linhas, testado) sobre o renderer existente).

## 5. Plano de migração por etapas (cada uma com testes + prova visual)

- **Etapa 1 — Base anatómica contínua + cadeia Root→Torso→Neck→Head**:
  reconstruir arte oculta do pescoço/torso; mesh+pesos na junção pescoço;
  rotação de torso e inclinação de cabeça sem separação; gates: continuidade
  no pescoço (Δ de borda ≤ 1 px), silhueta/leak, features v0.5 intactas.
- **Etapa 2 — Braços/mãos**: cadeias Clavicle→Hand L/R, hidden-art das axilas,
  corrective de cotovelo; testes: ombro, cotovelo, punho, mão, combinado.
- **Etapa 3 — Cabelo em 3 planos**: back/mid/front com cadeias + molas e
  ancoragens no scalp; gates: sem ecos/bordas duplicadas/seams/flutuantes,
  lag coerente entre planos.
- **Etapa 4 — Roupa/acessórios skinned + rosto no esqueleto** (Jaw, EyeSockets);
  boca/olhos actuais migrados para ossos sem perder visemas/gaze.
- **Etapa 5 — Poses por trigger + docs + mapa de exportação** (Live2D/Inochi2D
  como alvo externo opcional).

Regra de preservação: cada etapa corre o selftest completo (26 checks v0.5.1) +
novos checks; qualquer regressão bloqueia a etapa.

## 6. Mapeamento dos critérios de aceitação do mandato

| Critério | Onde | Verificação |
|---|---|---|
| Identidade mantida | folhas canon intocadas; arte-mestre única | diff visual por etapa + sheets em `references/` |
| Camadas documentadas | §3.1 + CHARACTER_LAYER_MAP (actualizado por etapa) | doc |
| 3 planos de cabelo funcionais | Etapa 3 | evidência sway 3 planos + gate de seams |
| Cabeça+pescoço sem separação | Etapa 1 | teste de continuidade + strip de rotação |
| Braços articulam sem cortes | Etapa 2 | testes ombro/cotovelo/punho/mão/combinado |
| Roupa segue anatomia | Etapa 4 | mesh de roupa pesada nos ossos; prova visual |
| Movimento suave e controlável | §3.3/3.4 | poses por vector; molas; checks de continuidade |
| Animações novas sem recortes novos | §3.5 | pipeline scriptado; gate de leak |
| Features antigas operacionais | flag rig + selftest 26 checks | CI local `npm run test:puppet` |
| Testes automáticos + evidência | selftest + `app/test_out/*` | este repo |

## 7. Riscos e mitigação
- Reconstrução de arte oculta pode derivar da identidade → edits só para zonas
  ocultas, validados por diff contra canon antes de entrar no rig.
- Custo de render por triângulo em canvas 2D → medir fps por etapa; PixiJS só
  se necessário (regra de medição prévia).
- Scope creep → etapas fechadas com gates; flag de fallback v0.5.
