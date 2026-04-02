var csjs = require('csjs-inject')

var css = csjs`
  .dropdown           {
    overflow          : visible;
    position          : relative;
    display           : flex;
    flex-direction    : column;
    margin-left       : 10px;
    width             : auto;
    margin-top        : 2px;
    max-height        : 24px;
  }
  .selectbox          {
    display           : flex;
    align-items       : center;
    cursor            : pointer;
  }
  .selected           {
    display           : inline-block;
    max-width         : 30ch;
    white-space       : nowrap;
    text-overflow     : ellipsis;
    overflow          : hidden;
    margin-right      : 10px;
    min-width         : 200px;
  }
  .icon               {
    padding           : 0px 5px;
  }
  .options            {
    position          : absolute;
    display           : flex;
    flex-direction    : column;
    align-items       : end;
    top               : 23px;
    left              : 0;
    width             : 245px;
    border            : 1px solid var(--dark);
    border-radius     : 3px;
    border-t        : 0;
    padding-left      : 5px;
  }
  .option {
    margin-left       : 5px;
    margin-top        : 5px;
    width             : -webkit-fill-available;
  }
`

module.exports = css
