import vm = require('vm');
import fs = require('fs');
import tf = require('@tensorflow/tfjs');


const prophet_path = './turnip_prophet/js/predictions.js';
vm.runInThisContext(fs.readFileSync(prophet_path, 'utf8'));

export declare enum PATTERN {
    FLUCTUATING = 0,
    LARGE_SPIKE = 1,
    DECREASING = 2,
    SMALL_SPIKE = 3,
}

PATTERN['UNKNOWN'] = -1;

interface PredictedPattern {
    pattern_description: string,
    pattern_number: PATTERN,
    probability?: number,
    category_total_probability?: number,
    weekGuaranteedMinimum: number,
    weekMax: number,
    prices: { min: number, max: number }[]
}

declare class Predictor {
    constructor(prices: number[], first_buy: boolean, past_pattern: number);

    analyze_possibilities(): PredictedPattern[];

}

global['i18next'] = {t: (x) => x.split('.')[1].toUpperCase()};

export const PATTERN_NAMES = {
    '-1': 'Unknown',
    0: 'Fluctuating', 1: 'Large Spike', 2: 'Decreasing', 3: 'Small Spike'
};


const silent_console = {
    log() {
    }
} as Console;

function uniform_distribution_greater(dist: { min: number, max: number }, x: number): number {
    if (dist.min <= x && x <= dist.max) {
        if (dist.min == dist.max) {
            return 0;
        } else {
            return 1 - (x - dist.min) / (dist.max - dist.min)
        }
    } else if (x < dist.min) {
        return 1;
    } else {
        return 0;
    }
}

export class TurnipPredictor {
    private readonly prices: number[];
    private readonly past_pattern: number;
    private readonly turnip_prophet: Predictor;

    constructor(turnip_data: any) {
        this.prices = turnip_data.prices.map(x => (x === null) ? NaN : x);
        this.past_pattern = turnip_data.past_pattern;

        this.turnip_prophet = new Predictor(
            this.prices, false, this.past_pattern
        );
    }

    predict_all(): PredictedPattern[] {
        const old_console = console;
        console = silent_console;
        const probabilities = this.turnip_prophet.analyze_possibilities();
        console = old_console;
        if (probabilities.length == 1) {
            throw 'Impossible prices!';
        } else {
            return probabilities;
        }
    }

    predict_pattern(): Record<PATTERN, number> {
        const all_probabilities = this.predict_all().slice(1);
        const patterns: Record<PATTERN, number> = [0, 0, 0, 0];
        for (let pattern of all_probabilities) {
            patterns[pattern.pattern_number] = pattern.category_total_probability;
        }
        return patterns;
    }

    async probability_greater(x): Promise<number[]> {
        const all_probabilities = this.predict_all().slice(1);
        const pattern_probabilities = tf.tensor1d(all_probabilities.map(pp => pp.probability));
        const in_pattern_probabilities = tf.tensor2d(all_probabilities.map(pp => pp.prices.map(p => uniform_distribution_greater(p, x))));

        const marginals = pattern_probabilities.reshape([-1,1]).mul(in_pattern_probabilities);
        return await marginals.sum(0).array() as number[];
    }
}
