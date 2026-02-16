import { } from "./ALFileHandler";

export class XliffIdToken {
    public type = "";
    private _name = "";
    public id = 0;

    public constructor(type: string, name: string) {
        this.type = type;
        this.name = name;
    }

    public get name(): string {
        return this._name;
    }

    public set name(value: string) {
        let v = value;
        if (v.startsWith('"') && v.endsWith('"')) {
            if (!v.substring(1, v.length - 1).includes('"')) {
                v = v.substring(1, v.length - 1);
            }
        }
        this.id = this.computeAlObjectHash(v);
        this._name = v;
    }

    public xliffId(): string {
        return `${this.type} ${this.id}`;
    }

    public static getXliffId(tokens: XliffIdToken[]): string {
        let result = "";
        for (const token of tokens) {
            result += `${token.xliffId()} - `;
        }
        return result.substring(0, result.length - 3);
    }

    /**
 * Computes the FNV-1a hash for AL object names and properties.
 * 
 * This function implements the Fowler-Noll-Vo hash algorithm using UTF-16 Little Endian encoding,
 * which is the standard hash function used by Microsoft Dynamics 365 Business Central's AL language
 * to generate unique identifiers for translation units in XLIFF files.
 * 
 * The hash value is deterministic - the same input always produces the same output, ensuring
 * consistent identification of translation strings across different systems and sessions.
 * (AI generated)
 * 
 * @param ObjectName The string to hash (typically an AL object name or property name)
 * @returns A positive 32-bit integer hash value suitable for use as an XLIFF identifier
 */
    public computeAlObjectHash(ObjectName: string): number {
        const data = Buffer.from(ObjectName, "utf16le");
        let hash = 0x811c9dc5;
        for (let i = 0; i < data.length; i++) {
            hash = hash ^ data[i];
            hash += (hash << 24) + (hash << 8) + (hash << 7) + (hash << 4) + (hash << 1);
        }
        hash = hash & 0xffffffff;
        return hash + 2147483647;
    }
}
