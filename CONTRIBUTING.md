# Contributing

Everyone is welcome to contribute to Remix's codebase and please join our [Discord](https://discord.gg/4b2rE9U4D2).

## Development
Remix libraries work closely with [Remix IDE](https://remix.ethereum.org). Each library has a README to explain its application.

When you add code to a library, please add related unit tests.

## Coding style

Use [JavaScript Standard Style](https://standardjs.com/) for the coding style.

## Submitting Pull Requests
Follow GitHub's standard model of making changes & submitting pull requests - explained [here](https://guides.github.com/activities/forking/). Please make sure your code works locally before submitting a pull request.

## Internationalization
Remix supports Internationalization.

### How to contribute translations?
Remix uses CrowdIn to manage translations.  Please DO NOT make a PR on GitHub with translation. To contribute, make an account on [CrowdIn](https://accounts.crowdin.com/register). 

Remix has four projects on CrowdIn
1. [RemixUI](https://crowdin.com/project/remix-ui/) - for translating Remix's User Interface
2. [Remix Docs](https://crowdin.com/project/remix-translation)  - for translating Remix's [Documentation](https://remix-ide.readthedocs.io)
3. [LearnEth](https://crowdin.com/project/remix-learneth) - for translating the tutorials in Remix's tutorial plugin called [Learneth](https://remix.ethereum.org/?#activate=solidity,solidityUnitTesting,LearnEth)
4. [Remix Project Website](https://crowdin.com/project/361d7e8c3b07220fa22e9d5a901b0021) - for translating the info site about [Remix](https://remix-project.org/)

There are many languages, for each project.  But if you do not see your desired language, send us a note on CrowdIn or in the Remix Discord.

In addition to writing translations, you can also review other's work. 

### How to make your plugin support string internationalization?
First, put the string in the locale file located under `apps/remix-ide/src/app/tabs/locales/en`.
Each json file corresponds to a module. If the module does not exist, then create a new json and import it in the `index.js`.
Then you can replace the string with an intl component. The `id` prop will be the key of this string.
```jsx
<label className="py-2 align-self-center m-0" style={{fontSize: "1.2rem"}}>
-  Learn
+  <FormattedMessage id="home.learn" />
</label>
```
In some cases, jsx may not be acceptable, you can use `intl.formatMessage` .
```jsx
<input
   ref={searchInputRef}
   type="text"
   className="border form-control border-right-0"
   id="searchInput"
-  placeholder="Search Documentation"
+  placeholder={intl.formatMessage({ id: "home.searchDocumentation" })}
   data-id="terminalInputSearch"
/>
```

### How to add another language support?
Let's say you want to add French.

First, create a folder named by the language code which is `fr`.
Then, create a json file, let's say `panel.json`,
```json
{
  "panel.author": "Auteur",
  "panel.maintainedBy": "Entretenu par",
  "panel.documentation": "Documentation",
  "panel.description": "La description"
}
```
Then, create a `index.js` file like this,
```js
import panelJson from './panel.json';
import enJson from '../en';

// There may have some untranslated content. Always fill in the gaps with EN JSON.
// No need for a defaultMessage prop when rendering a FormattedMessage component.
export default Object.assign({}, enJson, {
  ...panelJson,
})
```
Then, import `index.js` in `apps/remix-ide/src/app/tabs/locale-module.js`
```js
import enJson from './locales/en'
import zhJson from './locales/zh'
+import frJson from './locales/fr'

const locales = [
  { code: 'en', name: 'English', localeName: 'English', messages: enJson },
  { code: 'zh', name: 'Chinese Simplified', localeName: '简体中文', messages: zhJson },
+  { code: 'fr', name: 'French', localeName: 'Français', messages: frJson },
]
```
You can find the language's `code, name, localeName` in this link
https://github.com/ethereum/ethereum-org-website/blob/dev/i18n.config.json

### Whether or not to use `defaultMessage`?
If you search `FormattedMessage` or `intl.formatMessage` in this project, you will notice that most only have a `id` prop, but a few of them have a `defaultMessage` prop.

**Why?**

The gaps in an incomplete non-English language will be filled with English. The un-translated content will use English as defaultMessage. That's why we don't need to provide a `defaultMessage` prop each time we render a `FormattedMessage` component.

But in some cases, the `id` prop may not be static. For example,
```jsx
<h6 className="pt-0 mb-1" data-id='sidePanelSwapitTitle'>
 <FormattedMessage id={plugin?.profile.name + '.displayName'} defaultMessage={plugin?.profile.displayName || plugin?.profile.name} />
</h6>
```

Because you can't be sure if there is a matched key in the locale file, it's better to provide a `defaultMessage` prop.

### Should I update the non-English locale json files?
When you are updating an existing English locale json file, then you don't need to add any other languages, because CrowdIn will do it for you.

But if you add a new json file, only then English is needed.
