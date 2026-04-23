import { supabase } from './supabase';
import { getUser } from './auth';

export async function saveGameStats(gameId: string, seriesId: string | null, gameState: any) {
    const user = await getUser();
    if (!user) return;

    // Determine which team is ours
    const myTeam = gameState.homeTeam.userId === user.id ? gameState.homeTeam : gameState.awayTeam;
    const won = gameState.winnerId === user.id;

    // Determine pitcher W/L/SV
    const homeWon = gameState.score.home > gameState.score.away;
    const wl = gameState.wlTracker || {};
    const winPitcherId = homeWon ? (wl.homeWP || gameState.homeTeam.pitcher.cardId) : (wl.awayWP || gameState.awayTeam.pitcher.cardId);
    const lossPitcherId = homeWon ? (wl.awayLP || gameState.awayTeam.pitcher.cardId) : (wl.homeLP || gameState.homeTeam.pitcher.cardId);
    // Save: final pitcher on winning team, different from WP, with at least 1 out
    let savePitcherId: string | null = null;
    const winningTeam = homeWon ? gameState.homeTeam : gameState.awayTeam;
    const finalPitcherId = winningTeam.pitcher.cardId;
    if (finalPitcherId !== winPitcherId) {
        const finalPitcherStats = winningTeam.pitcherStats?.[finalPitcherId];
        const outsRecorded = finalPitcherStats?.ip || 0;
        const leadMargin = Math.abs(gameState.score.home - gameState.score.away);
        if (outsRecorded > 0 && (leadMargin <= 3 || outsRecorded >= 9)) {
            savePitcherId = finalPitcherId;
        }
    }
    // Determine if MY team's pitcher gets W/L/SV
    const myTeamIsHome = myTeam === gameState.homeTeam;
    const myTeamWon = (myTeamIsHome && homeWon) || (!myTeamIsHome && !homeWon);
    const myWinPitcher = myTeamWon ? winPitcherId : null;
    const myLossPitcher = !myTeamWon ? lossPitcherId : null;
    const mySavePitcher = myTeamWon ? savePitcherId : null;

    const rows: any[] = [];

    // Build display name with card metadata: "Name (Year Set #Num)"
    const cardDisplayName = (p: any) => {
        const parts = [p.name];
        const meta = [p.year, p.edition, p.cardNumber ? `#${p.cardNumber}` : ''].filter(Boolean);
        if (meta.length > 0) parts.push(`(${meta.join(' ')})`);
        return parts.join(' ');
    };

    // Batter stats
    for (const player of myTeam.lineup) {
        const bs = myTeam.batterStats?.[player.cardId];
        if (!bs) continue;
        rows.push({
            game_id: gameId, series_id: seriesId, user_id: user.id,
            card_id: player.cardId, card_name: cardDisplayName(player), card_type: 'hitter',
            pa: bs.pa || 0, ab: bs.ab || 0, h: bs.h || 0, r: bs.r || 0, rbi: bs.rbi || 0,
            bb: bs.bb || 0, ibb: bs.ibb || 0, so: bs.so || 0, hr: bs.hr || 0,
            db: bs.db || 0, tr: bs.tr || 0, tb: bs.tb || 0,
            sb: bs.sb || 0, cs: bs.cs || 0,
            gidp: bs.gidp || 0, sh: bs.sh || 0, sf: bs.sf || 0,
            win: won,
        });
    }

    // Pitcher stats — only pitchers who faced at least 1 batter
    for (const [cardId, ps] of Object.entries(myTeam.pitcherStats || {})) {
        const s = ps as any;
        if (!s.bf || s.bf === 0) continue; // skip pitchers who never entered the game
        const pitcher = myTeam.pitcher.cardId === cardId ? myTeam.pitcher
            : myTeam.bullpen?.find((p: any) => p.cardId === cardId);
        const name = pitcher ? cardDisplayName(pitcher) : cardId;
        const pWin = cardId === myWinPitcher;
        const pLoss = cardId === myLossPitcher;
        const pSave = cardId === mySavePitcher;
        rows.push({
            game_id: gameId, series_id: seriesId, user_id: user.id,
            card_id: cardId, card_name: name, card_type: 'pitcher',
            ip: s.ip || 0, p_h: s.h || 0, p_r: s.r || 0, p_bb: s.bb || 0,
            p_ibb: s.ibb || 0, p_so: s.so || 0, p_hr: s.hr || 0, bf: s.bf || 0,
            win: pWin, loss: pLoss, save: pSave,
        });
    }

    if (rows.length > 0) {
        // Upsert on the (game_id, user_id, card_id) unique constraint so
        // repeat calls (both players online, one reconnects post-game,
        // useEffect firing twice, etc.) just overwrite the same rows
        // instead of creating duplicates that would double-count in
        // career aggregations.
        const { error } = await supabase
            .from('game_player_stats')
            .upsert(rows, { onConflict: 'game_id,user_id,card_id' });
        if (error) throw error;
    }
}

// Get finished games for current user
export async function getGameHistory() {
    const user = await getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('games')
        .select('*')
        .or(`home_user_id.eq.${user.id},away_user_id.eq.${user.id}`)
        .eq('status', 'finished')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

// Get career batting stats aggregated by card
export async function getCareerBattingStats() {
    const user = await getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('game_player_stats')
        .select('card_id, card_name, pa, ab, h, r, rbi, bb, ibb, so, hr, db, tr, tb, sb, cs, gidp, sh, sf, win')
        .eq('user_id', user.id)
        .eq('card_type', 'hitter');
    if (error) throw error;

    // Aggregate by card_id
    const map = new Map<string, any>();
    for (const row of data || []) {
        if (!map.has(row.card_id)) {
            map.set(row.card_id, { card_id: row.card_id, card_name: row.card_name, games: 0, pa: 0, ab: 0, h: 0, r: 0, rbi: 0, bb: 0, ibb: 0, so: 0, hr: 0, db: 0, tr: 0, tb: 0, sb: 0, cs: 0, gidp: 0, sh: 0, sf: 0, wins: 0 });
        }
        const agg = map.get(row.card_id)!;
        agg.games++; agg.pa += (row.pa || 0); agg.ab += row.ab; agg.h += row.h; agg.r += row.r; agg.rbi += row.rbi;
        agg.bb += row.bb; agg.ibb += (row.ibb || 0); agg.so += row.so; agg.hr += row.hr;
        agg.db += (row.db || 0); agg.tr += (row.tr || 0); agg.tb += (row.tb || 0);
        agg.sb += row.sb; agg.cs += row.cs;
        agg.gidp += (row.gidp || 0); agg.sh += (row.sh || 0); agg.sf += (row.sf || 0);
        if (row.win) agg.wins++;
    }
    return Array.from(map.values());
}

// Get career pitching stats aggregated by card
export async function getCareerPitchingStats() {
    const user = await getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('game_player_stats')
        .select('card_id, card_name, ip, p_h, p_r, p_bb, p_ibb, p_so, p_hr, bf, win, loss, save')
        .eq('user_id', user.id)
        .eq('card_type', 'pitcher');
    if (error) throw error;

    const map = new Map<string, any>();
    for (const row of data || []) {
        // Skip phantom rows: pitcher never faced a batter (BF=0). Old games saved
        // before the bf-filter could insert these, polluting W/L for unused starters.
        if (!row.bf || row.bf === 0) continue;
        if (!map.has(row.card_id)) {
            map.set(row.card_id, { card_id: row.card_id, card_name: row.card_name, games: 0, ip: 0, h: 0, r: 0, bb: 0, ibb: 0, so: 0, hr: 0, bf: 0, wins: 0, losses: 0, saves: 0 });
        }
        const agg = map.get(row.card_id)!;
        agg.games++; agg.ip += row.ip; agg.h += row.p_h; agg.r += row.p_r;
        agg.bb += row.p_bb; agg.ibb += row.p_ibb; agg.so += row.p_so; agg.hr += row.p_hr;
        agg.bf += row.bf;
        if (row.win) agg.wins++;
        if (row.loss) agg.losses++;
        if (row.save) agg.saves++;
    }
    return Array.from(map.values());
}
