import re

with open('src/pages/GameDetailPage.vue', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Change grid from 2 cols to 3 cols
content = content.replace(
    '<div class="grid gap-4 lg:grid-cols-2">',
    '<div class="grid gap-4 lg:grid-cols-3">'
)

# 2. Add column 1 wrapper and mesa fieldset
old_col1_start = '''        <div>
          <h2 class="mb-2 text-lg font-semibold">
            {{ t('gamesView.stands') }}'''
new_col1_start = '''        <!-- Columna 1: Marcador, Fichas de riichi, Estado mano siguiente, Mesa -->
        <div class="space-y-4">
          <div>
            <h2 class="mb-2 text-lg font-semibold">
              {{ t('gamesView.stands') }}'''
content = content.replace(old_col1_start, new_col1_start)

# Add mesa fieldset after next-hand fieldset in column 1
old_fieldset_end = '''          </fieldset>
        </div>

        <div>'''
new_fieldset_end = '''          </fieldset>

            <!-- Mesa -->
            <fieldset
              v-if="mesa.length > 0"
              class="mt-3 rounded border border-mahjong-border bg-mahjong-surface p-3"
              data-test="mesa"
            >
              <legend class="px-1 text-mahjong-muted text-sm font-medium">
                {{ t('turnForm.mesa.title') }}
              </legend>
              <div class="grid grid-cols-2 gap-3">
                <div
                  v-for="row in mesa"
                  :key="row.playerId"
                  class="relative rounded border border-mahjong-border bg-mahjong-bg p-3 transition-colors"
                  :data-test="`mesa-${row.seat}`"
                  :class="{
                    'ring-2 ring-mahjong-positive': row.isWinner,
                    'ring-2 ring-mahjong-negative': row.isRonLoser,
                  }"
                >
                  <div class="flex items-start justify-between gap-2 mb-2">
                    <div class="flex items-center gap-2">
                      <div class="w-8 h-8 rounded-full bg-mahjong-border flex items-center justify-center text-xs text-mahjong-muted">
                        {{ row.name.charAt(0) }}
                      </div>
                      <span class="font-medium text-sm" data-test="mesa-name">{{ row.name }}</span>
                    </div>
                    <span
                      class="px-2 py-0.5 text-xs font-medium rounded-full text-white"
                      :class="windBadgeClass(row.seat)"
                      data-test="mesa-wind-badge"
                    >
                      {{ t(`gamesView.seats.${row.seat}`) }}
                    </span>
                  </div>
                  <div class="flex items-baseline justify-between gap-2">
                    <span class="font-mono text-xl font-bold text-mahjong-text" data-test="mesa-score">
                      {{ n(row.score, 'points') }}
                    </span>
                    <span
                      class="font-mono text-sm"
                      :class="row.deltaClass"
                      data-test="mesa-delta"
                    >
                      {{ row.deltaText }}
                    </span>
                  </div>
                  <div class="flex items-center justify-between mt-2">
                    <span
                      v-if="row.isDealer"
                      class="px-1.5 py-0.5 text-xs rounded border border-mahjong-border text-mahjong-muted"
                      data-test="mesa-dealer"
                    >
                      {{ t('turnForm.mesa.dealer') }}
                    </span>
                    <span
                      v-if="row.hasRiichi"
                      class="px-1.5 py-0.5 text-xs rounded-full bg-mahjong-accent/20 text-mahjong-accent shadow-glow-red"
                      data-test="mesa-riichi"
                    >
                      {{ t('turnForm.riichi') }}
                    </span>
                  </div>
                </div>
              </div>
            </fieldset>
          </div>

        <!-- Columna 2: Formulario de captura -->
        <div>'''

with open('src/pages/GameDetailPage.vue', 'w', encoding='utf-8') as f:
    f.write(content)

print("Step 1 done!")

# Step 2: Replace column 2 (TurnForm + turn history) with just TurnForm
with open('src/pages/GameDetailPage.vue', 'r', encoding='utf-8') as f:
    content = f.read()

old_col2 = '''<TurnForm v-if="canCapture" :game="game" />

          <ul
            class="divide-y divide-mahjong-border rounded border border-mahjong-border bg-mahjong-surface"
          >'''
new_col2 = '''<TurnForm v-if="canCapture" :game="game" />
        </div>

        <!-- Columna 3: Listado de turnos capturados -->
        <div>
          <div class="relative pl-4 border-l border-mahjong-border" data-test="turn-timeline">
            <ul
              v-if="(turns ?? []).length > 0"
              class="divide-y divide-mahjong-border rounded border border-mahjong-border bg-mahjong-surface"
            >
              <li
                v-for="turn in turns ?? []"
                :key="turn.turnNo"
                class="flex flex-col gap-1 px-3 py-2 text-sm">'''

with open('src/pages/GameDetailPage.vue', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(old_col2, new_col2)

with open('src/pages/GameDetailPage.vue', 'w', encoding='utf-8') as f:
    f.write(content)

print("Step 2 done!")

# Step 3: Replace the closing of the old turn list with new column 3 closing
with open('src/pages/GameDetailPage.vue', 'r', encoding='utf-8') as f:
    content = f.read()

old_ending = '''</ul>
        </div>
      </div>
      </div>
    </template>'''
new_ending = '''</ul>
        </div>
      </div>
      </div>
    </section>
    </template>'''

with open('src/pages/GameDetailPage.vue', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(old_ending, new_ending)

with open('src/pages/GameDetailPage.vue', 'w', encoding='utf-8') as f:
    f.write(content)

print("Step 3 done!")

# Remove duplicate old turn history
with open('src/pages/GameDetailPage.vue', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the old turn history that was duplicated
old_duplicate = '''</ul>
        </div>
      </div>
      </div>
            <li
              v-for="turn in turns ?? []"
              :key="turn.turnNo"
              class="flex flex-col gap-1 px-3 py-2 text-sm"
            >
              <span>
                <span class="font-medium">T{{ turn.turnNo }}</span>
                <span class="text-mahjong-muted">
                  · {{ t(`turnForm.resultTypes.${turn.resultType}`) }}
                </span>
                <span class="text-mahjong-muted">
                  · {{ t('gamesView.capturedBy') }}: {{ turn.capturedBy }}
                </span>
              </span>
              <ul
                v-if="turn.audit.length > 0"
                class="flex flex-col gap-1 text-xs text-mahjong-muted"
                data-test="turn-audit"
              >
                <li v-for="(entry, index) in turn.audit" :key="`${entry.at.seconds}-${index}`">
                  <template v-if="entry.action === 'delete'">
                    {{ t('gamesView.turnDeleted', { turn: entry.turnNo, at: atOf(entry.at) }) }}
                  </template>
                  <template v-else>
                    {{ t('gamesView.correctedBy', { by: entry.by, at: atOf(entry.at) }) }}
                    <span>
                      <span v-for="change in entry.changes" :key="change.field" class="ml-2">
                        {{ fieldLabel(change.field) }} {{ t('gamesView.audit.from') }}
                        {{ change.from }} {{ t('gamesView.audit.to') }} {{ change.to }} ({{
                          change.derived
                            ? t('gamesView.audit.derived')
                            : t('gamesView.audit.manual')
                        }})
                      </span>
                    </span>
                  </template>
                </li>
              </ul>
            </li>
            <li v-if="(turns ?? []).length === 0" class="px-3 py-4 text-sm text-mahjong-muted">
              {{ t('gamesView.noTurns') }}
            </li>
          </ul>

          <ul
            v-if="(game.turnAudit ?? []).length > 0"
            class="mt-3 flex flex-col gap-1 rounded border border-mahjong-border px-3 py-2 text-xs text-mahjong-muted"
            data-test="game-turn-audit"
          >
            <li class="text-mahjong-muted">{{ t('gamesView.audit.deletedInGame') }}</li>
            <li v-for="(entry, index) in game.turnAudit" :key="`${entry.at.seconds}-${index}`">
              {{ t('gamesView.turnDeleted', { turn: entry.turnNo, at: atOf(entry.at) }) }}
              {{ entry.by }}
            </li>
          </ul>
        </div>
      </div>
      </div>
    </template>'''

new_ending = '''</ul>
        </div>
      </div>
      </div>
    </section>
    </template>'''

with open('src/pages/GameDetailPage.vue', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(old_duplicate, new_ending)

with open('src/pages/GameDetailPage.vue', 'w', encoding='utf-8') as f:
    f.write(content)

print("Step 4 done!")

print("All done!")
PYEOF
python tmp_apply_changes.py