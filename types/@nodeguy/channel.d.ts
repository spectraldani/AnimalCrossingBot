import ReadableStream = NodeJS.ReadableStream;

declare module '@nodeguy/channel' {

    export interface ChannelObject<T> {
        close(): Promise<void>

        readOnly(): ChannelObject<T>

        writeOnly(): ChannelObject<T>

        value(): T

        push(x: T): Promise<number>

        shift(): Promise<T> | undefined

        values(): Promise<Iterator<T>>
    }

    interface ChannelFunction {
        <T>(length?: number): ChannelObject<T>

        select(ps: ChannelObject[]): Promise<ChannelObject>

        isChannel(x: any): x is ChannelObject<any>

        of<T>(...values: T): ChannelObject<T>

        from<T>(x: () => T | Iterable<T> | ReadableStream): typeof x extends ReadableStream ? ChannelObject<string | Buffer> : ChannelObject<T>
    }

    declare var Channel: ChannelFunction;
    export = Channel;
}
