interface BaseUpdate {
    update_id: number
}

interface MessageUpdate extends BaseUpdate {
    message: Message
}

interface EditedMessageUpdate extends BaseUpdate {
    edited_message: Message
}

interface CallbackQueryUpdate extends BaseUpdate {
    callback_query: CallbackQuery
}

export type Update = MessageUpdate | EditedMessageUpdate | CallbackQueryUpdate | BaseUpdate;


interface Success<T> {
    ok: true
    description?: string
    result: T
}

interface Failure {
    ok: false
    description: string
    error_code: number
}

export type Result<T> = Success<T> | Failure;

export interface User {
    id: number
    first_name: string
    username?: string
}

export interface Chat {
    id: number
}

export interface Message {
    message_id: number
    from?: User
    date: number
    chat: Chat
    reply_to_message?: Message
    text?: string
}

interface CallbackQuery {
    id: string
    from: User
    message?: Message
    inline_message_id?: number
    data?: string
}

export interface InlineKeyboardButton {
    text: string
    callback_data?: string
}

interface InlineKeyboardMarkup {
    inline_keyboard: InlineKeyboardButton[][]
}

export type ReplyMarkup = 'MarkdownV2' | 'HTML' | 'Markdown';

export namespace MethodArguments {
    export interface SendMessage {
        chat_id: number | string
        text: string
        parse_mode?: ReplyMarkup
        disable_web_page_preview?: boolean
        disable_notification?: boolean
        reply_to_message_id?: number
        reply_markup?: InlineKeyboardMarkup
    }

    export interface EditMessageText {
        chat_id: number | string
        message_id: number
        text: string
        parse_mode?: ReplyMarkup
        disable_web_page_preview?: boolean
        reply_markup?: InlineKeyboardMarkup
    }

    export interface EditMessageReplyMarkup {
        chat_id: number | string
        message_id: number
        reply_markup?: InlineKeyboardMarkup
    }

    export interface AnswerCallbackQuery {
        callback_query_id: string
        text?: string
        show_alert?: boolean
    }
}
