/**
 * 必须是 安卓5 及其以上版本使用
 * webView功能扩展:
 * 1 启动时注入脚本。 webView.loadUrl 加载的脚本，必须是： 1、以 ; 结尾；  2、不能用 // 注释 （这里不使用，安卓必须是4.4以上版本才能用）
 * 2 webview输出到autojs控制台
 * 3 支持渲染markdown文件
 * 4 支持jsBridge，H5端调用安卓端autojs方法
 * 5 支持inent url打开app
 * 6 支持vconsole
 */

requiresApi(21);
let bridgeHandler  = require(files.cwd() + "/expand/handler/bridgeHandler.js");
let webErrorHandler = require(files.cwd() + "/expand/handler/webErrorHandler.js");
let jsBridge = files.read("expand/core/jsBridge.ts");
// let vConsole = files.read("expand/core/vConsole.ts");
let vConsole = files.read("expand/core/vconsole.min.ts");
/**
 * 初始化，支持页面加载完时注入脚本
 * @param {*} webViewWidget webView控件
 * @param {*} jsFile   待注入的多个js文件路径，数组格式
 * @param {*} supportVConsole   是否支持VConsole
 */
function init(webViewWidget, jsFile, supportVConsole) {
    console.assert(webViewWidget != null, "webView控件为空");
    webViewWidget.webViewClient = new JavaAdapter(android.webkit.WebViewClient, {
        onPageFinished: (webView, curUrl)=>{
            console.log('页面加载完成');
            if (supportVConsole) {
                // log(vConsole)
                vConsole += ";const vconsole_temp = new VConsole();";
                callJavaScript(webView, vConsole, ()=>{
                    // webView.loadUrl("javascript:new VConsole();"); 
                });    
                // webView.loadUrl("javascript:" + vConsole);            
            }
            callJavaScript(webView, jsBridge, null);
            // webView.loadUrl("javascript:" + jsBridge);
            // console.log("注入jsBridge成功");
            jsFile.forEach((file, index) => {
                try {
                    let js = files.read(file);
                    callJavaScript(webView, js, (val) => {
                        // console.log("脚本注入成功: " + file);
                    });
                    // webView.loadUrl("javascript:" + js);
                    // console.log("注入脚本: " + file);
                } catch (e) {
                    toastLog("脚本注入失败: " + file);
                    console.trace(e);
                }
            });
        },
        shouldOverrideUrlLoading: (webView, curUrl) => {
            let url = curUrl.a.a;
            try {
                if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://")) {
                    webView.loadUrl(url);
                } else {
                    let uri = android.net.Uri.parse(url);
                    app.startActivity(new Intent(Intent.ACTION_VIEW).setData(uri).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP));
                }
                // 返回true代表自定义处理，返回false代表触发webview加载
                return true;
            } catch(e) {
                if (e.javaException instanceof android.content.ActivityNotFoundException) {
                    webView.loadUrl(url);
                 } else {
                    console.trace(e);
                    toastLog('无法打开URL: ' + url);
                 }
            }
        },
        shouldInterceptRequest: (webView, request) => {
            try {
                let uris = request.a.a.split("/");
                if (uris[2] == "jsbridge") {
                    let cmd = uris[3];
                    let params = java.net.URLDecoder.decode(uris[4], "UTF-8");
                    return handleJsBridge(cmd, params);
                }
            } catch (e) {
                console.trace(e);
            }
        },
        onReceivedError: (webView, webResourceRequest , webResourceError ) => {
            let url = webResourceRequest.getUrl();
            let errorCode = webResourceError.getErrorCode();
            let description = webResourceError.getDescription();
            console.trace(errorCode + " " + description)
            if (webErrorHandler) {
                let handleFile = webErrorHandler[errorCode];
                log(handleFile)
                if (handleFile) {
                    loadLocalFile(webView, handleFile);
                }
            }
        }
    });
    webViewWidget.webChromeClient = new JavaAdapter(android.webkit.WebChromeClient, {
        onConsoleMessage: (msg) => {
            console.log("[%s:%s]: %s", msg.sourceId(), msg.lineNumber(), msg.message());
        }
    });
}

/** 
 * JavaScript bridge 请求处理
 * @returns android.webkit.WebResourceResponse
 */
function handleJsBridge(cmd, params) {
    console.log('安卓接收到JavaScript调用请求: cmd=%s, params=%s', cmd, params);
    let data = {};
    try {
        data = bridgeHandler.handle(cmd, JSON.parse(params));
    } catch(e) {
        data = {message: e.message};
    }
    data = JSON.stringify(data || {});
    let bytes = new java.lang.String(data.toString()).getBytes();
    let response = new android.webkit.WebResourceResponse("application/json", "utf-8", new java.io.ByteArrayInputStream(bytes));
    let headers = new java.util.HashMap();
    // 设置允许跨域
    headers.put("Access-Control-Allow-Origin", "*");
    headers.put("Access-Control-Allow-Methods", "*");
    headers.put("Access-Control-Allow-Headers", "*");
    response.setResponseHeaders(headers);
    return response;
}

/**
 * 渲染markdown文件
 * @param {*} webViewWidget webView控件
 * @param {*} markdownFile  本地markdown文件的绝对路径
 */
function showMarkdown(webViewWidget, markdownFile) {
    console.assert(webViewWidget != null, "webView控件为空");
    let markdownLib = files.cwd() + "/res/js/marked.min.js";
    let markdownStr = files.read(markdownFile, encoding = "utf-8");
    markdownStr = markdownStr.replace("\r", "\n\n");
    let unencodedHtml = new java.lang.String(
    "<!doctype html>\r" +
    "<html>\r" +
    "<head>\r" +
    "<meta charset='utf-8'/>\r" +
    "</head>\r" +
    "<body>\r" +
    "<div id='content'></div>\r" +
    "<script src='https://cdn.jsdelivr.net/npm/marked/marked.min.js'></script> \r" +
    "<script>\r" +
    "    document.getElementById('content').innerHTML =\r" +
    "    marked(`" + markdownStr + "`,{breaks: true});\r" +
    "</script> \r" +
    "</body>\r" +
    "</html>");
    let encodedHtml = java.util.Base64.getEncoder().encodeToString(unencodedHtml.getBytes());
    webViewWidget.loadData(encodedHtml, "text/html", "base64");
}
/**
 * 加载本地文件
 * @param {*} webViewWidget 
 * @param {*} filePath
 */
function loadLocalFile(webViewWidget, filePath) {
    try {
        console.assert(webViewWidget != null, "webView控件为空");
        console.assert(filePath != null, "本地文件为空");
        let path = filePath;
        if (!filePath.startsWith("/")) {
            // 相对路径
            path = files.cwd() + "/" + filePath;
        }
        webViewWidget.loadUrl(path);
    } catch (e) {
        console.error("加载本地文件失败");
        console.trace(e);
    }
}

/**
 * 执行html脚本
 * @param {*} webViewWidget 
 * @param {*} script 
 * @param {*} callback 
 */
function callJavaScript(webViewWidget, script, callback) {
    try {
        console.assert(webViewWidget != null, "webView控件为空");
        webViewWidget.evaluateJavascript("javascript:" + script, new JavaAdapter(android.webkit.ValueCallback, {
            onReceiveValue: (val) => {
                if (callback) {
                    callback(val);
                }
            }
        }));
    } catch (e) {
        console.error("执行JavaScript失败");
        console.trace(e);
    }
}

module.exports = {
    init: init,
    showMarkdown: showMarkdown,
    callJavaScript: callJavaScript
}