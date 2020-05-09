import {PATTERN} from "./turnips/predictor";
import {Moment} from "moment-timezone/moment-timezone";

export enum FRUITS {
    // Portuguese
    // noinspection JSUnusedGlobalSymbols,SpellCheckingInspection
    MACA = 0,
    MAÇÃ = 0,
    CEREJA = 1,
    LARANJA = 2,
    PESSEGO = 3,
    PÊSSEGO = 3,
    PERA = 4,
    PÊRA = 4,

    // English
    APPLE = 0,
    CHERRY = 1,
    ORANGE = 2,
    PEACH = 3,
    PEAR = 4,
}

export interface TurnipData {
    past_pattern: PATTERN
    prices: number[]
    buy_price: number | null
    week: [number, number]
}

export interface IIsland {
    username: string
    name: string
    native_fruit: FRUITS
    timezone: string

    open: boolean
    dodo: string | null

    turnips: TurnipData | null
}

export class Island implements IIsland {
    username: string;
    name: string;
    native_fruit: FRUITS;
    timezone: string;

    open: boolean = false;
    dodo: string | null = null;
    turnips: TurnipData | null = null;

    constructor(username: string, island_name: string, fruit: FRUITS, timezone: string) {
        this.username = username;
        this.name = island_name;
        this.native_fruit = fruit;
        this.timezone = timezone;

        this.open = false;
        this.dodo = null;
    }
}

export function is_turnip_data_current(island: IIsland, date: Moment) {
    const island_date = date.tz(island.timezone);
    const [week, year] = island.turnips!.week;

    return year === island_date.weekYear() ? week >= island_date.week() : false;
}
