/**
 * Checkbox Plus
 *
 * @author Mohammad Fares <faressoft.com@gmail.com>
 */

'use strict';

const _ = require('lodash');
const chalk = require('chalk');
const { map, takeUntil } = require('rxjs/operators');
const cliCursor = require('cli-cursor');
const figures = require('figures');
const Base = require('inquirer/lib/prompts/base');
const Choices = require('inquirer/lib/objects/choices');
const observe = require('inquirer/lib/utils/events');
const Paginator = require('inquirer/lib/utils/paginator');

/**
 * CheckboxPlusPrompt
 */
class CheckboxPlusPrompt extends Base {

  /**
   * Initialize the prompt
   *
   * @param  {Object} questions
   * @param  {Object} rl
   * @param  {Object} answers
   */
  constructor(questions, rl, answers) {

    super(questions, rl, answers);

    // Default values (could be removed)
    this.opt.highlight = this.opt.highlight ?? false;
    this.opt.searchable = this.opt.searchable ?? false;
    this.opt.default = this.opt.default ?? null;
    this.opt.minimumChoices = this.opt.minimumChoices ?? 0;
    this.opt.maximumChoices = this.opt.maximumChoices ?? null;

    // Doesn't have source option
    if (!this.opt.source) {
      this.throwParamError('source');
    }

    // Init
    this.pointer = 0;
    this.firstSourceLoading = true;
    this.choices = new Choices([], answers);
    this.checkedChoices = [];
    this.value = [];
    this.lastQuery = null;
    this.searching = false;
    this.lastSourcePromise = null;
    this.default = this.opt.default;
    this.opt.default = null;

    this.alterValidator();

    this.paginator = new Paginator(this.screen);

  }

  /**
   * Apply a default message to a criteria
   * @param {undefined|number|[number, string]} criteria 
   * @param {(criteria)=>string} defaultMessage 
   * @returns {[number, string]} criteria 
   */
  decomposeCriteria(criteria, defaultMessage) {
    if (Array.isArray(criteria)) return criteria;

    return [criteria, defaultMessage(criteria)]
  }

  /**
   * Take into account the minimumChoiches and maximumChoices options
   */
  alterValidator() {
    const optValidator = this.opt.validate;
    
    const [min, minMessage] = this.decomposeCriteria(this.opt.minimumChoices, function(min) {
      return `You have to check at least ${min} choice(s)`
    });

    const [max, maxMessage] = this.decomposeCriteria(this.opt.maximumChoices, function(min) {
      return `You have to check at least ${min} choice(s)`
    });

    this.opt.validate = function(answer) {
      if (min && answer.length < min) {
        return minMessage;
      }

      if (max && answer.length > max) {
        return maxMessage;
      }

      if (optValidator) {
        return optValidator(answer)
      }
      
      return true;
    }
  }

  /**
   * Start the Inquiry session
   *
   * @param  {Function} callback callback when prompt is done
   * @return {this}
   */
  _run(callback) {

    const self = this;

    this.done = callback;

    this.executeSource().then(function() {

      const events = observe(self.rl);

      const validation = self.handleSubmitEvents(
        events.line.pipe(map(self.getCurrentValue.bind(self)))
      );
      validation.success.forEach(self.onEnd.bind(self));
      validation.error.forEach(self.onError.bind(self));

      events.normalizedUpKey
        .pipe(takeUntil(validation.success))
        .forEach(self.onUpKey.bind(self));
      events.normalizedDownKey
        .pipe(takeUntil(validation.success))
        .forEach(self.onDownKey.bind(self));
      events.keypress
        .pipe(takeUntil(validation.success))
        .forEach(self.onKeypress.bind(self));
      events.spaceKey
        .pipe(takeUntil(validation.success))
        .forEach(self.onSpaceKey.bind(self));

      // If the search is enabled
      if (!self.opt.searchable) {

        events.numberKey
          .pipe(takeUntil(validation.success))
          .forEach(self.onNumberKey.bind(self));
        events.aKey
          .pipe(takeUntil(validation.success))
          .forEach(self.onAllKey.bind(self));
        events.iKey
          .pipe(takeUntil(validation.success))
          .forEach(self.onInverseKey.bind(self));

      } else {
        events.keypress
          .pipe(takeUntil(validation.success))
          .forEach(self.onKeypress.bind(self));
      }

      if (self.rl.line) {
        self.onKeypress();
      }

      // Init the prompt
      cliCursor.hide();
      self.render();

    });

    return this;

  }

  /**
   * Execute the source function to get the choices and render them
   */
  executeSource() {

    const self = this;
    let sourcePromise = null;

    // Remove spaces
    this.rl.line = _.trim(this.rl.line);

    // Same last search query that already loaded
    if (this.rl.line === this.lastQuery) {
      return;
    }

    // If the search is enabled
    if (this.opt.searchable) {
      if (typeof this.opt.source !== "function") {
        throw new Error("To be searchable, the source must be a function returing a promise")
      }

      sourcePromise = this.opt.source(this.answers, this.rl.line);
    } else if (typeof this.opt.source === 'function') {
      sourcePromise = this.opt.source(this.answers, null);
    } else {
      sourcePromise = Promise.resolve(this.opt.source);
    }

    this.lastQuery = this.rl.line;
    this.lastSourcePromise = sourcePromise;
    this.searching = true;

    sourcePromise.then(function(choices) {

      // Is not the last issued promise
      if (self.lastSourcePromise !== sourcePromise) {
        return;
      }

      // Reset the searching status
      self.searching = false;

      // Save the new choices
      self.choices = new Choices(choices, self.answers);

      // Foreach choice
      self.choices.forEach(function(choice) {

        // Is the current choice included in the current checked choices
        self.toggleChoice(choice, _.some(self.value, _.isEqual.bind(null, choice.value)));

        // The default is not applied yet
        if (self.default) {

          // Is the current choice included in the default values
          if (_.findIndex(self.default, _.isEqual.bind(null, choice.value)) != -1) {
            self.toggleChoice(choice, true);
          }

        }

      });

      // Reset the pointer to select the first choice
      self.pointer = 0;
      self.render();
      self.default = null;
      self.firstSourceLoading = false;


    });

    return sourcePromise;

  }

  /**
   * Render the prompt
   *
   * @param  {Object} error
   */
  render(error) {

    // Render question
    let message = this.getQuestion();
    let bottomContent = '';

    // Answered
    if (this.status === 'answered') {

      message += chalk.cyan(this.selection.join(', '));
      return this.screen.render(message, bottomContent);

    }

    // No search query is entered before
    if (this.firstSourceLoading) {

      // If the search is enabled
      if (this.opt.searchable) {

        message +=
          '(Press ' +
          chalk.cyan.bold('<space>') +
          ' to select, ' +
          'or type anything to filter the list)';

      } else {

        message +=
          '(Press ' +
          chalk.cyan.bold('<space>') +
          ' to select, ' +
          chalk.cyan.bold('<a>') +
          ' to toggle all, ' +
          chalk.cyan.bold('<i>') +
          ' to invert selection)';

      }

    }

    // If the search is enabled
    if (this.opt.searchable) {

      // Print the current search query
      message += this.rl.line;

    }

    // Searching mode
    if (this.searching) {

      message += '\n  ' + chalk.cyan('Searching...');

    // No choices
    } else if (!this.choices.length) {

      message += '\n  ' + chalk.yellow('No results...');

    // Has choices
    } else {

      var choicesStr = this.renderChoices(this.choices, this.pointer);

      var indexPosition = this.choices.indexOf(
        this.choices.getChoice(this.pointer)
      );

      message += '\n' + this.paginator.paginate(choicesStr, indexPosition, this.opt.pageSize);

    }

    if (error) {
      bottomContent = chalk.red('>> ') + error;
    }

    this.screen.render(message, bottomContent);

  }

  /**
   * A callback function for the event:
   * When the user press `Enter` key
   *
   * @param {Object} state
   */
  onEnd(state) {

    this.status = 'answered';

    // Rerender prompt (and clean subline error)
    this.render();

    this.screen.done();
    cliCursor.show();
    this.done(state.value);

  }

  /**
   * A callback function for the event:
   * When something wrong happen
   *
   * @param {Object} state
   */
  onError(state) {
    this.render(state.isValid);
  }

  /**
   * Get the current values of the selected choices
   *
   * @return {Array}
   */
  getCurrentValue() {

    this.selection = _.map(this.checkedChoices, 'short');
    return _.map(this.checkedChoices, 'value');

  }

  /**
   * A callback function for the event:
   * When the user press `Up` key
   */
  onUpKey() {

    const len = this.choices.realLength;
    this.pointer = this.pointer > 0 ? this.pointer - 1 : len - 1;
    this.render();

  }

  /**
   * A callback function for the event:
   * When the user press `Down` key
   */
  onDownKey() {

    const len = this.choices.realLength;
    this.pointer = this.pointer < len - 1 ? this.pointer + 1 : 0;
    this.render();

  }

  /**
   * A callback function for the event:
   * When the user press a number key
   */
  onNumberKey(input) {

    if (input <= this.choices.realLength) {
      this.pointer = input - 1;
      this.toggleChoice(this.choices.getChoice(this.pointer));
    }

    this.render();

  }

  /**
   * A callback function for the event:
   * When the user press `Space` key
   */
  onSpaceKey() {

    // When called no results
    if (!this.choices.getChoice(this.pointer)) {
      return;
    }

    this.toggleChoice(this.choices.getChoice(this.pointer));
    this.render();

  }

  /**
   * A callback function for the event:
   * When the user press 'a' key
   */
  onAllKey() {

    const shouldBeChecked = Boolean(
      this.choices.find(function(choice) {
        return choice.type !== 'separator' && !choice.checked;
      })
    );

    this.choices.forEach(function(choice) {
      if (choice.type !== 'separator') {
        choice.checked = shouldBeChecked;
      }
    });

    this.render();

  }

  /**
   * A callback function for the event:
   * When the user press `i` key
   */
  onInverseKey() {

    this.choices.forEach(function(choice) {
      if (choice.type !== 'separator') {
        choice.checked = !choice.checked;
      }
    });

    this.render();

  }

  /**
   * A callback function for the event:
   * When the user press any key
   */
  onKeypress() {

    this.executeSource();
    this.render();

  }

  /**
   * Toggle (check/uncheck) a specific choice
   *
   * @param {Boolean} checked if not specified the status will be toggled
   * @param {Object}  choice
   */
  toggleChoice(choice, checked = !choice.checked) {

    // Remove the choice's value from the checked values
    _.remove(this.value, _.isEqual.bind(null, choice.value));

    // Remove the checkedChoices with the value of the current choice
    _.remove(this.checkedChoices, function(checkedChoice) {
      return _.isEqual(choice.value, checkedChoice.value);
    });

    choice.checked = checked;

    // Is the choice checked
    if (checked) {
      this.value.push(choice.value);
      this.checkedChoices.push(choice);
    }

  }

  /**
   * Get the checkbox figure (sign)
   *
   * @param  {Boolean} checked
   * @return {String}
   */
  getCheckboxFigure(checked) {

    return checked ? chalk.green(figures.radioOn) : figures.radioOff;

  }

  /**
   * Render the checkbox choices
   *
   * @param  {Array}  choices
   * @param  {Number} pointer the position of the pointer
   * @return {String} rendered content
   */
  renderChoices(choices, pointer) {

    const self = this;
    let output = '';
    let separatorOffset = 0;

    // Foreach choice
    choices.forEach(function(choice, index) {

      // Is a separator
      if (choice.type === 'separator') {

        separatorOffset++;
        output += ' ' + choice + '\n';
        return;

      }

      // Is the choice disabled
      if (choice.disabled) {

        separatorOffset++;
        output += ' - ' + choice.name;
        output += ' (' + (_.isString(choice.disabled) ? choice.disabled : 'Disabled') + ')';
        output += '\n';
        return;

      }

      // Is the current choice is the selected choice
      if (index - separatorOffset === pointer) {

        output += chalk.cyan(figures.pointer);
        output += self.getCheckboxFigure(choice.checked) + ' ';
        output += self.opt.highlight ? chalk.gray(choice.name) : choice.name;
        output += '\n';
        return;

      }

      output += ' ' + self.getCheckboxFigure(choice.checked) + ' ' + choice.name + '\n';

    });

    return output.replace(/\n$/, '');

  }

}

module.exports = CheckboxPlusPrompt;
