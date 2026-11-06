# Diretiva do utilizador — Personagem modular por camadas (referência permanente)

Origem: mensagens do utilizador de 2026-11-06 ("REESTRUTURAÇÃO DA PERSONAGEM POR CAMADAS E
COMPONENTES MODULARES" + "DOCUMENTO DE ARQUITETURA, ANATOMIA E ANIMAÇÃO MODULAR 2D").
Estado: **VINCULATIVA**. Este ficheiro condensa a diretiva para recuperação de contexto; as listas
marcadas *(verbatim)* reproduzem o texto do utilizador. Em caso de dúvida prevalece a mensagem original.

## 0. Decisão em vigor (2026-11-06)
O utilizador pediu um **remake**: *"primeiro desenha o corpo base, depois todo o resto; cada parte do
corpo terá os seus elementos"*. O trabalho v0.3–v0.6 fica como **conhecimento e referência** (e como
versão funcional de recurso), não como base da nova personagem. Gostou dos braços (v0.6) e da transição
do pescoço ("não parece costurado") — preservar essas lições.

Problemas reportados (OBSERVADOS pelo utilizador no preview, captura `image-11`):
- cabelo com **contornos brancos** e **movimento mau**; a cabeça também tem contornos;
- o **casaco descaído divide-se** quando ela mexe as mãos (corte/esqueleto atravessam a peça);
- componentes "não separados como pedido"; "falta método".

## 1. Princípio
**A personagem deve ser construída uma vez, com uma anatomia-base bem definida, e posteriormente
receber diferentes cabelos, roupas, acessórios e expressões sem precisar de reconstruir o corpo ou
alterar a sua identidade visual.** *(verbatim)*
"Não quero uma personagem diferente. Quero a mesma personagem, melhor estruturada."

## 2. Corpo-base *(verbatim, 2.1)*
Versão da personagem sem roupa, cabelo, acessórios ou expressões faciais, contendo:
- Anatomia feminina bem desenhada; proporções corporais consistentes.
- Formato natural dos seios, cintura, ancas e glúteos.
- Pescoço e articulações bem integrados; braços e pernas anatomicamente coerentes.
- Rosto-base sem olhos, boca ou expressões desenhadas. Cabeça inicialmente careca.
- **Restrição: não desenhar genitais.** A ausência de genitais não significa perder as características
  anatómicas femininas. Base técnica **não explícita** ("pode estar sem nada mas não significa nua").
- Reutilizável: não reconstruir a anatomia para mudar roupa, penteado ou acessório.

### 2.2 Correção do utilizador sobre o corpo-base (2026-11-06, VINCULATIVA)
- **REJEITADO:** fato/collants/macacão cinzento ou qualquer cobertura total (gen_i/gen_j, apagados).
  *"odiei odiei mesmo… nunca mais me cria isso"*. Nunca cobrir braços, pernas ou pescoço.
- **Caminho certo = gen_d** (`art_v07/base/base_body_gen_d.png`): *"esboço / massinha de modelar, não
  mulher nua"*; desenhar com **uma cor base e uma sombra**.
- **Censura escolhida pelo utilizador:** *"use interior castanho escuro fino no tecido mas não
  transparente para censurar"* → bandeau sem alças + cueca, castanho-escuro, opacos, finos, cozidos no
  corpo-base. (O texto reencaminhado lista "roupa interior inventada" como indesejada; aqui prevalece a
  proposta explícita do próprio utilizador.)
- **Altura canon: 168 cm** (o "108 cm" que apareceu numa imagem gerada estava errado). Proporções do
  gen_d MEDIDAS contra a folha canon à mesma escala queixo→sola: coincidem (ver `docs/CHECKPOINTS.md`).
- Os corpos-base são **esboços para acrescentar narizes, boca, roupa e acessórios** e para criar várias
  personagens a partir da mesma base — *"nada disso significa nudes"*.
- Se uma ferramenta impedir a execução exata: **explicar a limitação e propor antes** de alterar o
  visual (não inventar alternativas visuais sem perguntar).
- O nariz passa a ser **componente** (FACE/Nose); o rosto do corpo-base fica em branco.

## 3. Cabeça e rosto
Base da cabeça + componentes independentes: orelhas, olhos (globo, íris, pupila, pálpebras),
sobrancelhas, nariz (conforme o estilo), boca e elementos, máscaras/regiões de ocultação. A boca e os
olhos existentes "precisam de certas melhorias" mas são aproveitáveis.

## 4. Cabelo em três níveis (comportamento pedido)
| Nível | Conteúdo | Movimento |
|---|---|---|
| 1 — fundo | massa posterior, atrás da cabeça | acompanha a cabeça; secundário relativamente amplo |
| 2 — intermédio | laterais/camadas coladas à cabeça | **mínimo do mínimo**, às vezes nenhum ("quase nunca, mas mexe um pouco") — particularmente estável |
| 3 — frente | franjas/madeixas à frente do rosto | médio a expressivo, mais do que o 2 (às vezes ao nível do 1) |

Parâmetros independentes de amplitude, velocidade, atraso e resposta; não deslocar como três imagens
planas — madeixas podem ter articulação, deformação e física próprias.

## 5. Roupa e acessórios — independentes do esqueleto
**O esqueleto pertence à personagem. A roupa adapta-se ao esqueleto. A roupa não deve tornar-se parte
inseparável dele.** *(verbatim)* Casaco desenhado separadamente: parte traseira, frentes E/D, mangas
E/D, ombros, punhos, gola, fechos. Pontos de ligação e articulação, sobreposições suficientes,
deformações de tecido controladas (dobrar, comprimir, pregas, atraso). Substituir casaco/camisa/
uniforme/calças/sapatos sem reconstruir a personagem. Investigar deteção e correção de deformações,
interseções e separações roupa↔corpo.

## 6. Quatro características de cada componente
1. **Separação** 2. **Articulação** 3. **Restrições** 4. **Coordenação**.
"Separar visualmente as camadas não basta": definir ligação, deformação e ordenação durante a animação.

## 7. Qualidade visual — corrigir sistematicamente
Contornos brancos, halos, bordas mal recortadas, borrões, costuras, sobreposições incorretas, corpo a
atravessar roupa, separações artificiais, cores diferentes do original. **Investigar a origem antes de
corrigir** (recorte, máscara, exportação, importação ou renderizador). Conceitos: alpha, straight vs
premultiplied alpha, antialiasing, alpha bleeding, matte contamination. Correções legítimas:
descontaminação de cor nas bordas, expansão de cor sob áreas transparentes, dilatação/erosão de máscaras,
padding/bleed de textura. Zonas de sobreposição em todas as ligações (pescoço, ombro, cotovelo, pulso,
anca…). Resolução suficiente por componente; não ampliar peças de baixa qualidade.

## 8. Regras artísticas inegociáveis *(verbatim, 17)*
1. Não gerar uma personagem diferente.
2. Não substituir a arte original por uma nova interpretação.
3. Não alterar a identidade visual sem autorização.
4. Não criar contornos brancos.
5. Não aceitar borrões ou costuras visuais.
6. Não destruir elementos que já funcionam.
7. Não transformar a personagem num conjunto de peças rígidas.
8. Não deixar roupa e esqueleto inseparáveis.
9. Não sacrificar anatomia para facilitar uma animação.
10. Não sacrificar a qualidade visual para simplificar a implementação.
11. Não criar genitais na base corporal.
12. Não confundir a ausência de genitais com a ausência de anatomia feminina.
13. Não considerar uma camada independente apenas porque foi exportada como uma imagem separada.
14. Não considerar uma animação boa apenas porque o movimento existe.

## 9. Método
- **Agentes** quando trazem vantagem concreta (anatomia/desenho, animação 2D, arte/camadas,
  arquitetura, testes), cada um com responsabilidade e resultados verificáveis.
- **Checkpoints** (`docs/CHECKPOINTS.md`): estado, último checkpoint, componentes concluídos / em
  desenvolvimento, arquitetura, tecnologias, resultados, testes, problemas, experiências falhadas,
  próxima ação. Perda de contexto → recuperar o último checkpoint antes de continuar.
- Ciclo: problema → investigar → comparar → escolher → registar → implementar → testar → medir →
  checkpoint. **BUILD, DON'T FREEZE.**
- Trabalhar por camadas e componentes; não alterar várias partes ao mesmo tempo sem necessidade.
- Separar **arte** (texturas, máscaras), **rigging** (esqueleto, ligações, deformação) e **animação**
  (parâmetros, poses, física).

## 10. Árvore conceptual de componentes *(13)*
CHARACTER → BODY_BASE (Head_Base, Neck, Torso, Pelvis, Arms, Hands, Legs, Feet) · FACE (Eyes:
Eyeballs/Iris/Pupils/Eyelids; Eyebrows; Nose; Mouth) · HAIR (Back, Middle, Front) · CLOTHING
(Main_Garment, Sleeves, Collar, Details) · ACCESSORIES (Head, Ear, Body) · SKELETON · ANIMATION ·
PHYSICS. Estrutura conceptual, não obrigação de ficheiros.

## 11. Fases *(15)* e testes *(16)*
1 Auditoria · 2 Corpo-base e cabeça · 3 Sistema facial · 4 Cabelo · 5 Roupa · 6 Integração ·
7 Sistema reutilizável. Testes de cabeça, cabelo (incl. paragem repentina, cada nível e combinados),
braços, roupa (incl. substituição do uniforme) e visuais (fundo claro/escuro/transparente, ampliação,
redução, movimento rápido/lento) — verificar contornos brancos, bordas, borrões, costuras, espaços
vazios, sobreposições, deformações, perda de resolução.
Estados de evidência: FACT · OBSERVED · MEASURED · INFERRED · HYPOTHESIS · UNKNOWN.
Estados de componente: IMPLEMENTADO · TESTADO · APROVADO · PENDENTE (não confundir implementado com aprovado).

## 12. Tecnologias a estudar *(12)*
Live2D Cubism (ArtMesh, deformers, parameters, parts, draw order, clipping, physics), Inochi2D,
Spine (bones, meshes, skinning, IK, constraints, animation states), DragonBones (estado de manutenção),
técnicas próprias. Antes de integrar: estado, compatibilidade, licença, distribuição, desempenho,
dependências, limitações, integração.

**UMA ANATOMIA-BASE. COMPONENTES INDEPENDENTES. ARTICULAÇÕES COERENTES. MOVIMENTOS COORDENADOS.
IDENTIDADE VISUAL PRESERVADA.** *(verbatim)*
