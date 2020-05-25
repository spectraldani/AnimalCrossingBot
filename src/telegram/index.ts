import moment from 'moment-timezone';
import {Chat, ReplyMarkup, User} from "./api_types";

export interface BaseCommand {
    chat: Chat
    from: User
    message_id: number
}

export interface Command extends BaseCommand {
    kind: "command"
    date: moment.Moment
    order: [string, string[]]
}

export interface CallbackCommand extends BaseCommand {
    kind: "callback_command"
    callback_query_id: string
    callback: { (): Promise<BotAction> | BotAction }
}


export type BotAction =
    BotActions.SendMessage
    | BotActions.SendChoices
    | BotActions.AnswerCallbackQuery
    | BotActions.EditMessage
    | BotActions.EditChoices;

export namespace BotActions {
    interface BaseMessage {
        chat_id: number | string
        text: string
        parse_mode?: ReplyMarkup
        disable_web_page_preview?: boolean
    }

    interface BaseSendMessage extends BaseMessage {
        reply_id?: number
        disable_notification?: boolean
    }

    export interface SendMessage extends BaseSendMessage {
        kind: 'message'
    }

    export interface MessageChoice {
        text: string
        data?: any
    }

    export interface SendChoices extends BaseSendMessage {
        kind: 'choices'
        choices: MessageChoice[]
        callback: ChoiceCallback
    }

    export interface EditMessage extends BaseMessage {
        kind: 'edit_message'
        message_id: number
    }

    export interface EditChoices {
        kind: 'edit_choices'
        chat_id: number | string
        message_id: number
        choices: MessageChoice[]
    }

    export interface AnswerCallbackQuery {
        kind: 'answer_callback_query'
        query_id: string
        text?: string
        show_alert: boolean
    }
}

export interface ChoiceCallback {
    (command: CallbackCommand, data?: any): Promise<BotAction> | BotAction;
}
