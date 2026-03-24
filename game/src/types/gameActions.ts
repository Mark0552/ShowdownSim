export type GameAction =
    | { type: 'SKIP_PRE_ATBAT' }
    | { type: 'PINCH_HIT'; benchIndex: number; replacingIndex: number }
    | { type: 'SKIP_DEFENSE_SUB' }
    | { type: 'PITCHING_CHANGE'; pitcherIndex: number }
    | { type: 'INTENTIONAL_WALK' }
    | { type: 'SKIP_OFFENSE_PRE' }
    | { type: 'SACRIFICE_BUNT' }
    | { type: 'STEAL_BASE'; runnerId: string; icon?: boolean }
    | { type: 'ROLL_PITCH'; roll: number }
    | { type: 'ROLL_SWING'; roll: number }
    | { type: 'SAC_BUNT_ROLL'; roll: number }    // d20 for sac bunt on pitcher chart
    | { type: 'USE_ICON_V'; cardId: string }
    | { type: 'USE_ICON_S'; cardId: string }
    | { type: 'USE_ICON_HR'; cardId: string }
    | { type: 'USE_ICON_K' }
    | { type: 'USE_ICON_G'; cardId: string }
    | { type: 'USE_ICON_20' }
    | { type: 'USE_ICON_RP' }
    | { type: 'DECLINE_ICON' }
    | { type: 'EXTRA_BASE_YES'; runnerId: string }
    | { type: 'EXTRA_BASE_NO'; runnerId: string }
    | { type: 'FIELDING_ROLL'; roll: number }
    | { type: 'ADVANCE_ATBAT' }
    | { type: 'FORFEIT' };

export type IconType = 'V' | 'S' | 'HR' | 'K' | '20' | 'RP' | 'SB' | 'G' | 'CY';
