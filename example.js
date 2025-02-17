/**
 * Checkbox Plus Example
 * 
 * @author Mohammad Fares <faressoft.com@gmail.com>
 */

const inquirer = require('inquirer');
const fuzzy = require('fuzzy');

inquirer.registerPrompt('checkbox-plus', require('./index'));

const colors = [
  {name: 'The red color', value: 'red', short: 'red', disabled: false},
  {name: 'The blue color', value: 'blue', short: 'blue', disabled: true},
  {name: 'The green color', value: 'green', short: 'green', disabled: false},
  {name: 'The yellow color', value: 'yellow', short: 'yellow', disabled: false},
  {name: 'The black color', value: 'black', short: 'black', disabled: false},
  {name: 'The purple color', value: 'purple', short: 'purple', disabled: false}
];

inquirer.prompt([{
  type: 'checkbox-plus',
  name: 'colors',
  message: 'Enter colors',
  pageSize: 10,
  highlight: true,
  default: ['yellow', 'red', {name: 'black'}],
  minimumChoices: 1,
  maximumChoices: [4, "C'mon, you cannot choose every colors! Make a choice!"],
  validate(answer) {

    return answer.includes('red') || 'You cannot abandon red!';

  },
  // searchable: false,
  // source: colors,
  searchable: true,
  source(_, input = '') {

    return new Promise(function(resolve) {

      const fuzzyResult = fuzzy.filter(input, colors, {
        extract(item) {
          return item['name'];
        }
      });

      const data = fuzzyResult.map(function(element) {
        return element.original;
      });

      resolve(data);
      
    });

  }
}]).then(function(answers) {

  console.log(answers.colors);

});
