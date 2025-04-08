declare module 'pdf-parse' {
  function parse(buffer: Buffer): Promise<{ text: string, numpages: number, info: any, metadata: any }>;
  export default parse;
}