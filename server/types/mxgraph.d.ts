declare module 'mxgraph' {
  interface mxGraphExportObject {
    mxGraph: any;
    mxGraphModel: any;
    mxUtils: any;
    mxConstants: any;
    mxClient: any;
    mxSvgCanvas2D: any;
    mxXmlCanvas2D: any;
    mxCodec: any;
    mxImageExport: any;
    mxImage: any;
    mxPoint: any;
    mxRectangle: any;
  }

  function mxgraph(options?: any): mxGraphExportObject;
  export = mxgraph;
}