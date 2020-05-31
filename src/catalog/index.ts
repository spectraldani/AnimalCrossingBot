import * as fs from 'fs';
import {OrderList} from '../orders';
import Fuse from 'fuse.js';
import {BotAction, BotActions, CallbackCommand, ChoiceCallback} from '../telegram';
import assert from 'assert';
import {IIsland} from '../types';
import MessageChoice = BotActions.MessageChoice;

interface Catalog {
    [cat: string]: {
        [id: string]: CatalogItem
    } | undefined
}

interface CatalogItem {
    Name: string
    'Unique Entry ID': string

    [field: string]: string | number | null
}


interface IndexedCatalog {
    [cat: string]: { attr: string, id: string[] }[] | undefined
}

function make_fuse(c: IndexedCatalog) {
    const ret: Record<string, Fuse<{ attr: string, id: string[] }, any>> = {};
    for (const [cat, items] of Object.entries(c)) {
        ret[cat] = new Fuse(items!, {
            keys: ['attr'],
            includeScore: true,
            seExtendedSearch: false,
            minMatchCharLength: 2,
        });
    }
    return ret;
}

const catalog = JSON.parse(fs.readFileSync('./assets/data.json', 'utf8')) as Catalog;
const catalog_by_name_index = make_fuse(JSON.parse(fs.readFileSync('./assets/data_by_name.json', 'utf8')) as IndexedCatalog);
const recipe_by_material_name = JSON.parse(fs.readFileSync('./assets/recipe_by_material_name.json', 'utf8')) as Record<string, string[] | undefined>;
const recipes_by_name: any = JSON.parse(fs.readFileSync('./assets/recipes.json', 'utf8'));

export const orders = new OrderList();
orders.push({
    name: 'search',
    help: ['Search for a given item'],
    action: function (order_arguments, island, command, _, {database}) {
        const [query_string] = order_arguments;

        const results = Object.entries(catalog_by_name_index).flatMap(
            ([k, v]) => {
                if (k !== 'Recipes') return v.search(query_string).map(r => ({cat: k, ...r}));
                else return [];
            }
        );
        results.sort((a, b) => a.score! - b.score!);

        if (results.length == 0) {
            return 'No items matching query were found'
        }

        const chunked_results = chunk_array(results, 6);
        const choices: MessageChoice[][] = chunk_array(chunked_results[0], 2).map(row => row.map(x => ({
            text: x.item.attr,
            data: [x.cat, x.item.id]
        })));

        if (chunked_results.length == 1) {
            choices.push([{text: 'Cancel', data: null}]);
        } else {
            choices.push([{text: 'Cancel', data: null}, {text: 'Next', data: 1}]);
        }
        return {
            kind: 'choices',
            chat_id: command.chat.id,
            reply_id: command.message_id,
            parse_mode: 'Markdown',
            text: 'Select an item',
            choices: choices,
            callback: (inline_command, data: number | [string, string[]] | null): BotAction => {
                if (data !== null && typeof data === 'object') {
                    const [cat, ids] = data;
                    const items = ids.map(x => catalog[cat]![x]).filter(x =>
                        ((x['Variant ID'] as string | undefined)?.split('_')?.[1] ?? '0') === '0'
                    )
                    return item_message(cat, items, 0, inline_command, database);
                } else if (data !== null) {
                    const choices: MessageChoice[][] = chunk_array(chunked_results[data], 2).map(row => row.map(x => ({
                        text: x.item.attr,
                        data: [x.cat, x.item.id]
                    })));

                    if (chunked_results.length == data + 1) {
                        choices.push([{text: 'Back', data: data - 1}, {text: 'Cancel', data: null}]);
                    } else if (data > 0) {
                        choices.push([{text: 'Back', data: data - 1}, {text: 'Cancel', data: null}, {
                            text: 'Next',
                            data: data + 1
                        }]);
                    } else {
                        choices.push([{text: 'Cancel', data: null}, {text: 'Next', data: data + 1}]);
                    }

                    return {
                        kind: 'edit_choices',
                        chat_id: inline_command.chat.id,
                        message_id: inline_command.message_id,
                        choices: choices
                    }
                } else {
                    return {
                        kind: 'edit_message',
                        chat_id: inline_command.chat.id,
                        message_id: inline_command.message_id,
                        text: 'Canceled search',
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true
                    }
                }
            }
        };
    }
});

function escape(s: string): string {
    return s.replace('-', '\\-')
        .replace('.', '\\.');
}

function ensure_catalog_data(island: IIsland) {
    if (island.catalog_data === undefined) {
        island.catalog_data = {owned: {}, wishlist: {}}
    }
}

function add_to_catalog(island: IIsland, where: 'owned' | 'wishlist', item_id: string) {
    ensure_catalog_data(island);
    if (island.catalog_data![where][item_id] !== undefined) {
        return 'already_added';
    }
    if (where === 'wishlist') {
        if (island.catalog_data!.owned[item_id] !== undefined) return 'already_added';
    } else {
        if (island.catalog_data!.wishlist[item_id] !== undefined)
            delete island.catalog_data!.wishlist[item_id];
    }

    island.catalog_data![where][item_id] = true;
    return 'success'
}

function item_message(cat: string, items: CatalogItem[], i: number, inline_command: CallbackCommand, database: any): BotActions.EditMessage {
    const item = items[i];
    const has_more = (items.length > 1);
    let message = `\\[${escape(cat)}\\]\n`;
    message += `[*${escape(item['Name'])}*](https://acnhcdn.com/latest/FtrIcon/${item['Filename']}.png)`;

    let extra_message, extra_choices, extra_callback: ChoiceCallback | undefined;
    switch (cat) {
        case 'Art':
            [extra_message, extra_choices, extra_callback] = art_message(item, has_more);
            break;
        default:
            [extra_message, extra_choices, extra_callback] = default_item_message(item, has_more, cat, database);
            break;
    }
    message += extra_message;

    const trade_choices: MessageChoice[] = [
        {text: 'I want it', data: 'want'},
        {text: 'I have it', data: 'have'},
    ];

    let page_choices: MessageChoice[] = [];
    if (items.length > 1) {
        if (items.length == i + 1) {
            page_choices = [{text: 'Previous', data: i - 1}, {text: 'First', data: 0}];
        } else if (i == 0) {
            page_choices = [{text: 'Last', data: items.length - 1}, {text: 'Next', data: i + 1}];
        } else {
            page_choices = [{text: 'Previous', data: i - 1}, {text: 'Next', data: i + 1}];
        }
    }

    const callback: ChoiceCallback = (inline_command: CallbackCommand, data: string | number) => {
        if (typeof data === 'number')
            return item_message(cat, items, data, inline_command, database);
        switch (data) {
            case 'want': {
                const user_id = inline_command.from.id;
                const island: IIsland = database['islands'][user_id];
                const result = add_to_catalog(island, 'wishlist', item['Unique Entry ID'])
                const ret: BotActions.AnswerCallbackQuery = {
                    kind: 'answer_callback_query',
                    query_id: inline_command.callback_query_id,
                    show_alert: true,
                    text: ''
                }
                switch (result) {
                    case "success":
                        ret.text = `Added ${item['Name']} to your wishlist`;
                        break;
                    case "already_added":
                        ret.text = 'You already want this item or already have it';
                        break;
                }
                return ret;
            }
            case 'have': {
                const user_id = inline_command.from.id;
                const island: IIsland = database['islands'][user_id];
                const result = add_to_catalog(island, "owned", item['Unique Entry ID'])
                const ret: BotActions.AnswerCallbackQuery = {
                    kind: 'answer_callback_query',
                    query_id: inline_command.callback_query_id,
                    show_alert: true,
                    text: ''
                }
                switch (result) {
                    case "success":
                        ret.text = `Added ${item['Name']} to your catalog`;
                        break;
                    case "already_added":
                        ret.text = 'You already have this item';
                        break;
                }
                return ret;
            }
            default:
                if (extra_callback !== undefined) {
                    return extra_callback(inline_command, data);
                } else {
                    throw 'Unknown choice';
                }
        }
    }

    return {
        kind: 'edit_message',
        chat_id: inline_command.chat.id,
        message_id: inline_command.message_id,
        text: message,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: false,
        choices: [trade_choices, extra_choices, page_choices],
        callback: callback
    };
}

function art_message(item: CatalogItem, has_more: boolean): [string, MessageChoice[], ChoiceCallback?] {
    let message = '\n';
    if (has_more) message += `Genuine?: ${item['Genuine']}\n`;

    message += 'Title: ' + escape(item['Real Artwork Title'] as string);
    message += '\n' + escape(item['Artist'] as string);

    return [message, []];
}

function default_item_message(item: CatalogItem, has_more: boolean, category: string, database: any): [string, MessageChoice[], ChoiceCallback?] {
    let message = '';
    if (has_more) {
        message += ` \\[${item['Variation']}\\]\n`;
    } else {
        message += '\n';
    }
    if (item['DIY'] === 'Yes') message += `Can craft? Yes\n`;
    if (item['Buy'] !== 'NFS') message += `Buy price: ${item['Buy']}\n`;

    const recipe_ids = recipe_by_material_name[item['Name']];
    if (recipe_ids !== undefined && recipe_ids.length > 0) {
        message += `Material for: ${recipe_ids.length} recipes\n`
    }

    const item_choices: MessageChoice[] = [];
    if (item['DIY'] === 'Yes') {
        item_choices.push({
            text: 'Show recipe',
            data: 'item:recipe'
        })
        item_choices.push({
            text: 'I want recipe',
            data: 'item:want_recipe'
        })
        item_choices.push({
            text: 'I have recipe',
            data: 'item:have_recipe'
        })
    }

    const extra_callback: ChoiceCallback = (inline_command: CallbackCommand, data: string | number) => {
        const recipe = recipes_by_name[category]![item['Name']]!;
        switch (data) {
            case 'item:recipe': {
                return {
                    kind: 'message',
                    chat_id: inline_command.chat.id,
                    reply_id: inline_command.message_id,
                    text: format_recipe(recipe),
                    parse_mode: 'Markdown'
                };
            }
            case 'item:want_recipe': {
                const user_id = inline_command.from.id;
                const island: IIsland = database['islands'][user_id];
                const result = add_to_catalog(island, "wishlist", recipe['Unique Entry ID'])
                const ret: BotActions.AnswerCallbackQuery = {
                    kind: 'answer_callback_query',
                    query_id: inline_command.callback_query_id,
                    show_alert: true,
                    text: ''
                }
                switch (result) {
                    case "success":
                        ret.text = `Added recipe for ${item['Name']} to your wishlist`;
                        break;
                    case "already_added":
                        ret.text = 'You already want this recipe or already have it';
                        break;
                }
                return ret;
            }
            case 'item:have_recipe': {
                const user_id = inline_command.from.id;
                const island: IIsland = database['islands'][user_id];
                const result = add_to_catalog(island, "owned", recipe['Unique Entry ID'])
                const ret: BotActions.AnswerCallbackQuery = {
                    kind: 'answer_callback_query',
                    query_id: inline_command.callback_query_id,
                    show_alert: true,
                    text: ''
                }
                switch (result) {
                    case "success":
                        ret.text = `Added recipe for ${item['Name']} to your catalog`;
                        break;
                    case "already_added":
                        ret.text = 'You already have this recipe';
                        break;
                }
                return ret;
            }
            default:
                throw 'Invalid option';
        }
    }

    return [message, item_choices, extra_callback];
}

function format_recipe(recipe: any) {
    let message = `*Recipe for ${recipe['Name'][1]}*:\n`;
    for (const {amount, material} of recipe['Materials']) {
        message += `${amount}x ${material}\n`;
    }
    message += `Source: ${recipe['Source']}\n`
    if (recipe['Source Notes'] !== null) {
        message += recipe['Source Notes']
    }
    return message;
}

function chunk_array<T>(array: T[], max_count: number): T[][] {
    assert(max_count > 0, 'max_count has to be greater than 0');
    const ret = [];
    const N = array.length;
    for (let i = 0; i < N; i += max_count) {
        ret.push(array.slice(i, i + max_count));
    }
    return ret;
}
