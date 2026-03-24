export type GameAction =
    | { type: 'SKIP_PRE_ATBAT' }                // no pinch hit
    | { type: 'PINCH_HIT'; benchIndex: number; replacingIndex: number }
    | { type: 'SKIP_DEFENSE_SUB' }              // no pitching change or IBB
    | { type: 'PITCHING_CHANGE'; pitcherIndex: number }
    | { type: 'INTENTIONAL_WALK' }
    | { type: 'SKIP_OFFENSE_PRE' }              // no bunt or steal
    | { type: 'SACRIFICE_BUNT' }
    | { type: 'STEAL_BASE'; runnerId: string; icon?: boolean } // icon = SB icon
    | { type: 'ROLL_PITCH'; roll: number }       // d20 value
    | { type: 'ROLL_SWING'; roll: number }       // d20 value
    | { type: 'USE_ICON_V'; cardId: string }     // vision reroll
    | { type: 'USE_ICON_S'; cardId: string }     // speed upgrade
    | { type: 'USE_ICON_HR'; cardId: string }    // power upgrade
    | { type: 'USE_ICON_K' }                     // strikeout block
    | { type: 'USE_ICON_G'; cardId: string }     // gold glove
    | { type: 'USE_ICON_20' }                    // +3 control
    | { type: 'DECLINE_ICON' }
    | { type: 'EXTRA_BASE_YES'; runnerId: string }
    | { type: 'EXTRA_BASE_NO'; runnerId: string }
    | { type: 'FIELDING_ROLL'; roll: number }    // d20 for DP or throw
    | { type: 'ADVANCE_ATBAT' }                  // move to next batter
    | { type: 'FORFEIT' };

export type IconType = 'V' | 'S' | 'HR' | 'K' | '20' | 'RP' | 'SB' | 'G' | 'CY';
