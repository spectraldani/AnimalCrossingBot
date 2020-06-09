import * as fs from 'fs';
import {OrderList} from '../orders';
import Fuse from 'fuse.js';
import {MessageButton, reply_command} from '../telegram/BotActions';
import assert from 'assert';
import {IIsland} from '../types';
import {get_island} from "../island_orders";
import Channel from "@nodeguy/channel";
import {CallbackCommand} from "../telegram/user_commands";
import Bot from "../telegram/Bot";

interface Catalog {
    [id: string]: CatalogItem | undefined
}

interface CatalogItem {
    Name: string
    'Unique Entry ID': string
    Category: string

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
    name: 'wishlist',
    help: ['List your wishlist'],
    async action(bot, order_arguments, command, database) {
        const island = await get_island(database, command.from);
        ensure_catalog_data(island);
        const wishlist = island.catalog_data!.wishlist;
        const list_by_cat: Record<string, CatalogItem[] | undefined> = {};
        for (const id of Object.keys(wishlist)) {
            const item = catalog[id]!;
            if (list_by_cat[item.Category] === undefined) list_by_cat[item.Category] = []
            list_by_cat[item.Category]!.push(item);
        }

        let message = '';
        for (const [cat, item_list] of Object.entries(list_by_cat)) {
            message += `\\[${cat}\\]\n`;
            for (const item of item_list!) {
                message += `${item['Name']}\n`;
            }
            message += '\n';
        }
        await bot.send_message({
            text: message,
            parse_mode: 'Markdown',
            ...reply_command(command)
        });
    }
})

orders.push({
    name: 'search',
    help: ['Search for a given item'],
    async action(bot, order_arguments, command, database) {
        const [query_string] = order_arguments;

        const results = Object.entries(catalog_by_name_index).flatMap(
            ([k, v]) => {
                if (k !== 'Recipes') return v.search(query_string);
                else return [];
            }
        );
        results.sort((a, b) => a.score! - b.score!);

        if (results.length == 0) {
            await bot.send_message({
                text: 'No items matching query were found',
                ...reply_command(command)
            })
            return;
        }
        const paged_results = chunk_array(results, 6);
        const {result: message} = await bot.send_message({
            text: "Please wait...",
            ...reply_command(command)
        })

        let state: { kind: 'searching', page: number } | { kind: 'displaying', item: number, ids: string[], page: number } | null;
        state = {kind: 'searching', page: 0};
        while (state !== null) switch (state.kind) {
            case "searching": {
                const current_page = paged_results[state.page];
                const chan = Channel<CallbackCommand<number | string[] | null>>();

                const item_buttons: MessageButton[][] = chunk_array(current_page.map(x => {
                    return {text: x.item.attr, data: x.item.id}
                }), 2);

                let page_buttons: MessageButton[];
                if (state.page + 1 < paged_results.length && state.page > 0) {
                    page_buttons = [
                        {text: 'Previous', data: state.page - 1},
                        {text: 'Cancel', data: null},
                        {text: 'Next', data: state.page + 1},
                    ];
                } else if (state.page == 0) {
                    page_buttons = [
                        {text: 'Last', data: paged_results.length - 1},
                        {text: 'Cancel', data: null},
                        {text: 'Next', data: state.page + 1},
                    ];
                } else {
                    page_buttons = [
                        {text: 'Previous', data: state.page - 1},
                        {text: 'Cancel', data: null},
                        {text: 'First', data: 0},
                    ];
                }

                await bot.edit_message({
                    chat_id: message.chat.id,
                    message_id: message.message_id,
                    text: "Select a item:",
                    choices: {
                        buttons: [
                            ...item_buttons,
                            page_buttons
                        ], channel: chan
                    }
                });

                const callback_command = await chan.shift();
                if (callback_command === undefined) throw new Error('Channel shouldn\'t be closed here');

                if (callback_command.data === null) {
                    state = null;
                } else if (typeof callback_command.data === 'number') {
                    state.page = callback_command.data;
                } else {
                    state = {kind: 'displaying', item: 0, ids: callback_command.data, page: state.page};
                }
                await chan.close();
                break;
            }
            case "displaying": {
                const item = catalog[state.ids[state.item]]!;
                const chan = Channel<CallbackCommand<number | string | null>>();
                const {text, extra_choices, extra_command_process} = item_message(item, (state.ids.length > 1));

                const trade_choices: MessageButton[] = [
                    // {text: 'I want it', data: 'want'},
                    // {text: 'I have it', data: 'have'},
                ];

                let page_choices: MessageButton[];
                if (state.ids.length > 1) {
                    if (state.item + 1 == state.ids.length) {
                        page_choices = [
                            {text: 'Previous', data: state.item - 1},
                            {text: 'Return', data: null},
                            {text: 'First', data: 0}
                        ];
                    } else if (state.item == 0) {
                        page_choices = [
                            {text: 'Last', data: state.ids.length - 1},
                            {text: 'Return', data: null},
                            {text: 'Next', data: state.item + 1}
                        ];
                    } else {
                        page_choices = [
                            {text: 'Previous', data: state.item - 1},
                            {text: 'Return', data: null},
                            {text: 'Next', data: state.item + 1}
                        ];
                    }
                } else {
                    page_choices = [{text: 'Return', data: null}];
                }

                await bot.edit_message({
                    chat_id: message.chat.id,
                    message_id: message.message_id,
                    text,
                    parse_mode: 'MarkdownV2',
                    choices: {
                        buttons: [trade_choices, extra_choices, page_choices],
                        channel: chan
                    }
                });

                while (true) {
                    const callback_command = await chan.shift();
                    if (callback_command === undefined) throw new Error('Channel shouldn\'t be closed here');
                    const data = callback_command.data;

                    if (data === null) {
                        state = {kind: "searching", page: state.page};
                        await chan.close()
                        break;
                    } else if (typeof data === 'number') {
                        const ids: string[] = state.ids;
                        state = {kind: "displaying", item: data, ids: ids, page: state.page};
                        await chan.close()
                        break;
                    } else switch (data) {
                        default: {
                            if (!await extra_command_process(bot, callback_command, data)) {
                                await bot.answer_callback_query({
                                    query_id: callback_command.callback_query_id,
                                    show_alert: true,
                                    text: "Not implemented yet"
                                });
                            }
                        }
                    }
                }
                break;
            }
        }

        await bot.edit_message({
            chat_id: message.chat.id,
            message_id: message.message_id,
            text: "Canceled"
        })
    }
});


function markdownv2_escape(s: string): string {
    return s.replace(/-/g, '\\-')
        .replace(/\./g, '\\.');
}

function ensure_catalog_data(island: IIsland) {
    if (island.catalog_data === undefined) {
        island.catalog_data = {owned: {}, wishlist: {}}
    }
}

//
// function add_to_catalog(island: IIsland, where: 'owned' | 'wishlist', item_id: string) {
//     ensure_catalog_data(island);
//     if (island.catalog_data![where][item_id] !== undefined) {
//         return 'already_added';
//     }
//     if (where === 'wishlist') {
//         if (island.catalog_data!.owned[item_id] !== undefined) return 'already_added';
//     } else {
//         if (island.catalog_data!.wishlist[item_id] !== undefined)
//             delete island.catalog_data!.wishlist[item_id];
//     }
//
//     island.catalog_data![where][item_id] = true;
//     return 'success'
// }
//
function item_message(item: CatalogItem, has_more: boolean) {
    let text = `\\[${markdownv2_escape(item.Category)}\\]\n`;
    text += `[*${markdownv2_escape(item.Name)}*](https://acnhcdn.com/latest/FtrIcon/${item.Filename!}.png)`;

    let result;
    switch (item.Category) {
        case 'Art':
            result = art_message(item, has_more);
            break;
        default:
            result = default_item_message(item, has_more);
            break;
    }
    const {message: extra_message, extra_choices, extra_command_process} = result;
    text += extra_message;

    return {
        text,
        extra_choices,
        extra_command_process
    };
}

function art_message(item: CatalogItem, has_more: boolean) {
    let message = '\n';
    if (has_more) message += `Genuine?: ${item.Genuine}\n`;

    message += 'Title: ' + markdownv2_escape(item['Real Artwork Title'] as string);
    message += '\n' + markdownv2_escape(item.Artist as string);

    return {message, extra_choices: [], extra_command_process: () => false};
}

function default_item_message(item: CatalogItem, has_more: boolean) {
    let message = '';
    if (has_more) {
        message += ` \\[${item['Variation']}\\]\n`;
    } else {
        message += '\n';
    }
    if (item.DIY === 'Yes') message += `Can craft? Yes\n`;
    if (item.Buy !== 'NFS') message += `Buy price: ${item.Buy}\n`;
    if (item.Source) message += `Source: ${markdownv2_escape(item.Source as string)}`;

    const recipe_ids = recipe_by_material_name[item['Name']];
    if (recipe_ids !== undefined && recipe_ids.length > 0) {
        message += `Material for: ${recipe_ids.length} recipes\n`
    }

    const extra_choices: MessageButton[] = [];
    if (item['DIY'] === 'Yes') {
        extra_choices.push({
            text: 'Show recipe',
            data: 'item:recipe'
        })
        // item_choices.push({
        //     text: 'I want recipe',
        //     data: 'item:want_recipe'
        // })
        // item_choices.push({
        //     text: 'I have recipe',
        //     data: 'item:have_recipe'
        // })
    }

    async function extra_command_process(bot: Bot, callback_command: CallbackCommand<any>, data: string | number) {
        const recipe = recipes_by_name[item.Category]![item.Name]!;
        switch (data) {
            case 'item:recipe': {
                await bot.send_message({
                    chat_id: callback_command.chat.id,
                    reply_id: callback_command.message_id,
                    text: format_recipe(recipe),
                    parse_mode: 'Markdown'
                });
                await bot.answer_callback_query({
                    query_id: callback_command.callback_query_id,
                    show_alert: false
                });
                return true;
            }
            // case 'item:want_recipe': {
            //     const user_id = inline_command.from.id;
            //     const island: IIsland = database['islands'][user_id];
            //     const result = add_to_catalog(island, "wishlist", recipe['Unique Entry ID'])
            //     const ret: BotActions.AnswerCallbackQuery = {
            //         kind: 'answer_callback_query',
            //         query_id: inline_command.callback_query_id,
            //         show_alert: true,
            //         text: ''
            //     }
            //     switch (result) {
            //         case "success":
            //             ret.text = `Added recipe for ${item['Name']} to your wishlist`;
            //             break;
            //         case "already_added":
            //             ret.text = 'You already want this recipe or already have it';
            //             break;
            //     }
            //     return ret;
            // }
            // case 'item:have_recipe': {
            //     const user_id = inline_command.from.id;
            //     const island: IIsland = database['islands'][user_id];
            //     const result = add_to_catalog(island, "owned", recipe['Unique Entry ID'])
            //     const ret: BotActions.AnswerCallbackQuery = {
            //         kind: 'answer_callback_query',
            //         query_id: inline_command.callback_query_id,
            //         show_alert: true,
            //         text: ''
            //     }
            //     switch (result) {
            //         case "success":
            //             ret.text = `Added recipe for ${item['Name']} to your catalog`;
            //             break;
            //         case "already_added":
            //             ret.text = 'You already have this recipe';
            //             break;
            //     }
            //     return ret;
            // }
            default:
                return false;
        }
    }

    return {message, extra_choices, extra_command_process};
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
