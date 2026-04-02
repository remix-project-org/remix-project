var csjs = require('csjs-inject')

var css = csjs`
  .panel              {
    position          : relative;
    display           : flex;
    flex-direction    : column;
    font-size         : 12px;
    min-height        : 3em;
  }
  .bar                {
    display           : flex;
    z-index           : 2;
  }
  .menu               {
    position             : relative;
    display              : flex;
    align-items          : center;
    width                : 100%;
    max-height           : 35px;
    min-height           : 35px;
  }
  .toggleTerminal              {
    cursor            : pointer;
  }
  .toggleTerminal:hover              {
    color             : var(--bs-secondary);
  }
  .terminal_container   {
    display             : flex;
    flex-direction      : column;
    height              : 100%;
    overflow-y          : auto;
    font-family         : monospace;
    margin              : 0px;
    background-repeat   : no-repeat;
    background-position : center 15%;
    background-size     : auto calc(75% -  1.7em);
  }
  .terminal    {
    position          : relative;
    display           : flex;
    flex-direction    : column;
    height            : 100%;
  }
  .journal            {
    margin-top        : auto;
    font-family       : monospace;
  }
  .block              {
    word-break        : break-word;
    white-space       : pre-wrap;
    line-height       : 2ch;
    padding           : 1ch;
    margin-top        : 2ch;
  }
  .block > pre        {
    max-height        : 200px;
  }
  .cli                {
    line-height       : 1.7em;
    font-family       : monospace;
    padding           : .4em;
    color             : var(--bs-primary)
    border-t        : solid 2px var(--bs-secondary);
  }
  .prompt             {
    margin-right      : 0.5em;
    font-family       : monospace;
    font-weight       : bold;
    font-size         : 14px;
  }
  .input              {
    word-break        : break-word;
    outline           : none;
    font-family       : monospace;
  }
  .search {
    display           : flex;
    align-items       : center;
    width             : 330px;
    padding-left      : 20px;
    height            : 100%;
    padding-top       : 1px;
    padding-bottom    : 1px;
  }
  .filter                       {
    height                      : 80%;
    white-space                 : nowrap;
    overflow                    : hidden;
    text-overflow               : ellipsis;
  }
  .searchIcon                   {
    width                       : 25px;
    border-t-left-radius      : 3px;
    border-b-left-radius   : 3px;
    display                     : flex;
    align-items                 : center;
    justify-content             : center;
    margin-right                : 5px;
  }
  .listen         {
    margin-right  : 30px;
    min-width     : 40px;
    height        : 13px;
    display       : flex;
    align-items   : center;
  }
  .listenLabel {
    min-width: 50px;
  }
  .verticalLine {
    border-left       : 1px solid var(--bs-secondary)
    height            : 65%;
  }
  .dragbarHorizontal  {
    position          : absolute;
    top               : 0;
    height            : 0.5em;
    right             : 0;
    left              : 0;
    cursor            : ns-resize;
    z-index           : 999;
  }
  .listenOnNetwork {
    min-height: auto;
  }
  .ghostbar           {
    position          : absolute;
    height            : 6px;
    opacity           : 0.5;
    cursor            : row-resize;
    z-index           : 9999;
    left              : 0;
    right             : 0;
  }
`

module.exports = css
