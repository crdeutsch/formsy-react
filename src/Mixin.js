var utils = require('./utils.js');

var convertValidationsToObject = function (validations) {

  if (typeof validations === 'string') {

    return validations.split(/\,(?![^{\[]*[}\]])/g).reduce(function (validations, validation) {
      var args = validation.split(':');
      var validateMethod = args.shift();

      args = args.map(function (arg) {
        try {
          return JSON.parse(arg);
        } catch (e) {
          return arg; // It is a string if it can not parse it
        }
      });

      if (args.length > 1) {
        throw new Error('Formsy does not support multiple args on string validations. Use object format of validations instead.');
      }

      validations[validateMethod] = args.length ? args[0] : true;
      return validations;
    }, {});

  }

  return validations || {};
};

module.exports = {
  getInitialState: function () {
    return {
      _isRequired: false,
      _isValid: true,
      _defaultValue: this.props.defaultValue || '',
      _validationError: '',
      _externalError: null,
      _formSubmitted: false
    };
  },
  getDefaultProps: function () {
    return {
      validationError: '',
      validationErrors: {}
    };
  },

  componentWillMount: function () {
    var configure = function () {
      this.setValidations(this.props.validations, this.props.required);
      this.props._attachToForm(this);
    }.bind(this);

    if (!this.props.name) {
      throw new Error('Form Input requires a name property when used');
    }

    if (!this.props._attachToForm) {
      return setTimeout(function () {
        if (!this.isMounted()) return;
        if (!this.props._attachToForm) {
          throw new Error('Form Mixin requires component to be nested in a Form');
        }
        configure();
      }.bind(this), 0);
    }
    configure();
  },

  // We have to make the validate method is kept when new props are added
  componentWillReceiveProps: function (nextProps) {
    this.setValidations(nextProps.validations, nextProps.required);
  },

  // Detach it when component unmounts
  componentWillUnmount: function () {
    this.props._detachFromForm(this);
  },

  setValidations: function (validations, required) {

    // Add validations to the store itself as the props object can not be modified
    this._validations = convertValidationsToObject(validations) || {};
    this._requiredValidations = required === true ? {isDefaultRequiredValue: true} : convertValidationsToObject(required);

  },

  hasValue: function () {
    return this.getValue() !== '';
  },
  getErrorMessage: function () {
    return !this.isValid() || this.showRequired() ? (this.state._externalError || this.state._validationError) : null;
  },
  isFormDisabled: function () {
    return this.props._isFormDisabled();
  },
  isValid: function () {
    return this.state._isValid;
  },
  isPristine: function () {
    return this.getValue() === this.state._defaultValue;
  },
  isFormSubmitted: function () {
    return this.state._formSubmitted;
  },
  isRequired: function () {
    return !!this.props.required;
  },
  showRequired: function () {
    return this.state._isRequired;
  },
  showError: function () {
    return !this.showRequired() && !this.isValid();
  },
  isValidValue: function (value) {
    return this.props._isValidValue.call(null, this, value);
  }
};
