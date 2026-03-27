declare module '@3d-dice/dice-box' {
    export default class DiceBox {
        constructor(selector: string, options?: any);
        init(): Promise<void>;
        roll(notation: string): Promise<any>;
        clear(): void;
    }
}
