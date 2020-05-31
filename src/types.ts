import {PATTERN} from "./turnips/predictor";
import {Moment} from "moment-timezone/moment-timezone";
import assert from "assert";

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
    id: number
    username: string
    name: string
    native_fruit: FRUITS
    timezone: string

    open: boolean
    dodo: string | null

    turnips?: TurnipData
}

export class Island implements IIsland {
    id: number;
    username: string;
    name: string;
    native_fruit: FRUITS;

    timezone: string;
    open: boolean = false;
    dodo: string | null = null;

    turnips?: TurnipData;

    constructor(id: number, username: string, island_name: string, fruit: FRUITS, timezone: string) {
        this.id = id;
        this.username = username;
        this.name = island_name;
        this.native_fruit = fruit;
        this.timezone = timezone;

        this.open = false;
        this.dodo = null;
    }
}


export function normalize_date_input(a: IIsland | Moment | [number, number]): [number, number] {
    if ('id' in a) {
        return a.turnips!.week
    } else if ('week' in a && 'weekYear' in a) {
        return [a.week(), a.weekYear()];
    } else if (typeof a[0] === 'number') {
        return a;
    } else {
        throw 'Invalid type';
    }
}

export function turnip_data_duration(a: IIsland | Moment | [number, number], b: IIsland | Moment | [number, number]) {
    const [a_week, a_year] = normalize_date_input(a);
    const [b_week, b_year] = normalize_date_input(b);
    assert(a_year == b_year, 'Years must match');
    return b_week - a_week;
}

export function is_turnip_data_current(island: IIsland, date: Moment) {
    const island_date = date.tz(island.timezone);
    return turnip_data_duration(island_date, island) >= 0;
}
