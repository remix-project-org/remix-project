/* eslint-disable */
ace.define("ace/theme/remixDark",["require","exports","module","ace/lib/dom"], function(acequire, exports, module) {

  exports.isDark = true;
  exports.cssClass = "ace-remixDark";
  exports.cssText = ".ace-remixDark .ace_gutter {\
  background: #2a2c3f;\
  color: #8789a1;\
  border-right: 1px solid #282828;\
  }\
  .ace-remixDark .ace_gutter-cell.ace_warning {\
  background-image: none;\
  background: #FC0;\
  border-left: none;\
  padding-left: 0;\
  color: #000;\
  }\
  .ace-remixDark .ace_gutter-cell.ace_error {\
  background-position: -6px center;\
  background-image: none;\
  background: #F10;\
  border-left: none;\
  padding-left: 0;\
  color: #000;\
  }\
  .ace-remixDark .ace_print-margin {\
  border-left: 1px solid #555;\
  right: 0;\
  background: #1D1D1D;\
  }\
  .ace-remixDark {\
  background-color: #222336;\
  color: #d5d5e9;\
  }\
  .ace-remixDark .ace_cursor {\
  border-left: 2px solid #FFFFFF;\
  }\
  .ace-remixDark .ace_cursor.ace_overwrite {\
  border-left: 0px;\
  border-b: 1px solid #FFFFFF;\
  }\
  .ace-remixDark .ace_marker-layer .ace_selection {\
  background: #494836;\
  }\
  .ace-remixDark .ace_marker-layer .ace_step {\
  background: rgb(198, 219, 174);\
  }\
  .ace-remixDark .ace_marker-layer .ace_bracket {\
  margin: -1px 0 0 -1px;\
  border: 1px solid #FCE94F;\
  }\
  .ace-remixDark .ace_marker-layer .ace_active-line {\
  background: #262843;\
  }\
  .ace-remixDark .ace_gutter-active-line {\
  background-color: #363950;\
  }\
  .ace-remixDark .ace_invisible {\
  color: #404040;\
  }\
  .ace-remixDark .ace_rparen {\
    color: #d4d7ed;\
  }\
  .ace-remixDark .ace_lparen {\
    color: #d4d7ed;\
  }\
  .ace-remixDark .ace_keyword {\
  color:#ffa76d;\
  }\
  .ace-remixDark .ace_keyword.ace_operator {\
  color:#eceeff;\
  }\
  .ace-remixDark .ace_constant {\
  color:#1EDAFB;\
  }\
  .ace-remixDark .ace_constant.ace_language {\
  color:#FDC251;\
  }\
  .ace-remixDark .ace_constant.ace_library {\
  color:#8DFF0A;\
  }\
  .ace-remixDark .ace_constant.ace_numeric {\
  color:#eceeff;\
  }\
  .ace-remixDark .ace_invalid {\
  color:#FFFFFF;\
  background-color:#990000;\
  }\
  .ace-remixDark .ace_invalid.ace_deprecated {\
  color:#FFFFFF;\
  background-color:#990000;\
  }\
  .ace-remixDark .ace_support {\
  color: #999;\
  }\
  .ace-remixDark .ace_support.ace_function {\
  color:#3fe2a7;\
  }\
  .ace-remixDark .ace_function {\
  color:#3fe2a7;\
  }\
  .ace-remixDark .ace_string {\
  color:#eceeff;\
  }\
  .ace-remixDark .ace_comment {\
  color:#a7a7a7;\
  font-style:italic;\
  padding-bottom: 0px;\
  }\
  .ace-remixDark .ace_type {\
  color:#75ceef;\
  }\
  .ace-remixDark .ace_visibility {\
    color:#f7d777;\
  }\
  .ace-remixDark .ace_identifier {\
    color:#bec1dd;\
  }\
  .ace-remixDark .ace_modifier {\
    color:#efff2f;\
  }\
  .ace-remixDark .ace-boolean {\
    color:#ff86ac;\
  }\
  .ace-remixDark .ace_statemutability {\
    color:#FFCC00;\
  }\
  .ace-remixDark .ace_variable {\
  color:#e0bb83;\
  }\
  .ace-remixDark .ace_meta.ace_tag {\
  color:#BE53E6;\
  }\
  .ace-remixDark .ace_entity.ace_other.ace_attribute-name {\
  color:#4aa8fd;\
  }\
  .ace-remixDark .ace_markup.ace_underline {\
  text-decoration: underline;\
  }\
  .ace-remixDark .ace_fold-widget {\
  text-align: center;\
  }\
  .ace-remixDark .ace_fold-widget:hover {\
  color: #777;\
  }\
  .ace-remixDark .ace_fold-widget.ace_start,\
  .ace-remixDark .ace_fold-widget.ace_end,\
  .ace-remixDark .ace_fold-widget.ace_closed{\
  background: none;\
  border: none;\
  box-shadow: none;\
  }\
  .ace-remixDark .ace_fold-widget.ace_start:after {\
  content: '▾'\
  }\
  .ace-remixDark .ace_fold-widget.ace_end:after {\
  content: '▴'\
  }\
  .ace-remixDark .ace_fold-widget.ace_closed:after {\
  content: '‣'\
  }\
  .ace-remixDark .ace_indent-guide {\
  border-right:1px dotted #333;\
  margin-right:-1px;\
  }\
  .ace-remixDark .ace_fold { \
  background: #222; \
  border-radius: 3px; \
  color: #7AF; \
  border: none; \
  }\
  .ace-remixDark .ace_fold:hover {\
  background: #CCC; \
  color: #000;\
  }\
  ";
  
  var dom = acequire("../lib/dom");
  dom.importCssString(exports.cssText, exports.cssClass);
  
  });