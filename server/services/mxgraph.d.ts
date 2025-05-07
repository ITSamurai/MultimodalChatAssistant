declare module 'mxgraph' {
  interface mxGraphExportObject {
    mxGraph: any;
    mxGraphModel: any;
    mxCell: any;
    mxGeometry: any;
    mxPoint: any;
    mxConstants: any;
    mxClient: any;
    mxImage: any;
    mxImageExport: any;
    mxXmlCanvas2D: any;
    mxCodec: any;
    mxUtils: any;
    mxImageBasePath: string;
    mxBasePath: string;
    mxLoadResources: boolean;
    mxLoadStylesheets: boolean;
  }

  function mxgraph(config: {
    mxImageBasePath?: string;
    mxBasePath?: string;
    mxLoadResources?: boolean;
    mxLoadStylesheets?: boolean;
  }): mxGraphExportObject;

  export = mxgraph;
}