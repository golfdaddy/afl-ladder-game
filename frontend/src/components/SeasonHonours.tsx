// Season Honours — end-of-season acknowledgment of first and last place in a
// competition. Rendered above leaderboards once the grand final has been played
// (SEASON_COMPLETE). Lower score is better, so the champion holds the minimum
// total and the wooden spoon the maximum; ties share the honour.

interface HonoursEntry {
  userId: number
  displayName: string
  totalPoints: number
}

export interface SeasonHonoursProps {
  entries: HonoursEntry[]
  currentUserId: number | null
  seasonYear?: number
}

function namesLine(list: HonoursEntry[], currentUserId: number | null): string {
  return list
    .map(e => (e.userId === currentUserId ? `${e.displayName} (you!)` : e.displayName))
    .join(' & ')
}

export default function SeasonHonours({ entries, currentUserId, seasonYear }: SeasonHonoursProps) {
  if (entries.length === 0) return null

  const min = Math.min(...entries.map(e => e.totalPoints))
  const max = Math.max(...entries.map(e => e.totalPoints))
  const champions = entries.filter(e => e.totalPoints === min)
  const spooners = entries.filter(e => e.totalPoints === max)
  // Everyone tied (or a one-person comp): a spoon would be meaningless
  const showSpoon = entries.length >= 2 && max !== min

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
      {/* Champion */}
      <div className={`relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-white p-4 ${showSpoon ? '' : 'sm:col-span-2'}`}>
        <div className="absolute -right-4 -top-4 text-7xl opacity-10 select-none" aria-hidden>🏆</div>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-2xl flex-shrink-0">🏆</div>
          <div className="min-w-0">
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
              {seasonYear ? `${seasonYear} ` : ''}{champions.length > 1 ? 'Joint Champions' : 'Champion'}
            </p>
            <p className="text-base font-black text-slate-900 truncate">{namesLine(champions, currentUserId)}</p>
            <p className="text-xs text-amber-700 font-semibold">{min} pts — closest to the final ladder</p>
          </div>
        </div>
      </div>

      {/* Wooden spoon */}
      {showSpoon && (
        <div className="relative overflow-hidden rounded-2xl border border-orange-200/70 bg-gradient-to-br from-orange-50/70 via-stone-50 to-white p-4">
          <div className="absolute -right-4 -top-4 text-7xl opacity-10 select-none" aria-hidden>🥄</div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-100/80 border border-orange-200/70 flex items-center justify-center text-2xl flex-shrink-0">🥄</div>
            <div className="min-w-0">
              <p className="text-[10px] font-black text-orange-600/90 uppercase tracking-widest">Wooden Spoon</p>
              <p className="text-base font-black text-slate-900 truncate">{namesLine(spooners, currentUserId)}</p>
              <p className="text-xs text-orange-700/80 font-semibold">{max} pts — there's always next year</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
