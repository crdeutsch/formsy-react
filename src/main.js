var React = global.React || require('react');
var Formsy = {};
var validationRules = require('./validationRules.js');
var utils = require('./utils.js');
var Mixin = require('./Mixin.js');
var options = {};

Formsy.Mixin = Mixin;

Formsy.defaults = function (passedOptions) {
  options = passedOptions;
};

Formsy.addValidationRule = function (name, func) {
  validationRules[name] = func;
};

Formsy.Form = React.createClass({
  internalState: {
    isValid: true,
    isSubmitting: false,
    canChange: false,
    formSubmitted: false
  },

  getDefaultProps: function () {
    return {
      onSuccess: function () {},
      onError: function () {},
      onSubmit: function () {},
      onValidSubmit: function () {},
      onInvalidSubmit: function () {},
      onSubmitted: function () {},
      onValid: function () {},
      onInvalid: function () {},
      onChange: function () {},
      validationErrors: null
    };
  },

  // Add a map to store the inputs of the form, a model to store
  // the values of the form and register child inputs
  componentWillMount: function () {
    this.inputs = {};
    this.model = {};
  },

  componentDidMount: function () {
    this.validate();
  },

  componentWillUpdate: function () {

    // Keep a reference to input keys before form updates,
    // to check if inputs has changed after render
    this.prevInputKeys = Object.keys(this.inputs);

  },

  componentDidUpdate: function () {

    if (this.props.validationErrors) {
      this.setInputValidationErrors(this.props.validationErrors);
    }

    var newInputKeys = Object.keys(this.inputs);
    if (utils.arraysDiffer(this.prevInputKeys, newInputKeys)) {
      this.validate();
    }

  },

  reset: function () {
    this.setFormPristine(true);
    this.resetModel();
  },

  // Update model, submit to url prop and send the model
  submit: function (event) {

    event && event.preventDefault();

    this.validate();
    this.setFormPristine(false);
    this.updateModel();
    var model = this.mapModel();
    this.props.onSubmit(model, this.resetModel, this.updateInputsWithError);
    this.internalState.isValid ? this.props.onValidSubmit(model, this.resetModel, this.updateInputsWithError) : this.props.onInvalidSubmit(model, this.resetModel, this.updateInputsWithError);

  },

  mapModel: function () {
    return this.props.mapping ? this.props.mapping(this.model) : this.model;
  },

  // Goes through all registered components and
  // updates the model values
  updateModel: function () {
    Object.keys(this.inputs).forEach(function (name) {
      var component = this.inputs[name];
      this.model[name] = component.getValue();
    }.bind(this));
  },

  // Reset each key in the model to the original / initial value
  resetModel: function () {
    Object.keys(this.inputs).forEach(function (name) {
      // resetValue function may or may not exist depending on if component implemented it
      if (this.inputs[name].resetValue) {
        this.inputs[name].resetValue();
      }
    }.bind(this));
    this.validate();
  },

  setInputValidationErrors: function (errors) {
    Object.keys(this.inputs).forEach(function (name, index) {
      var component = this.inputs[name];
      var args = [{
        _isValid: !(name in errors),
        _validationError: errors[name]
      }];
      component.setState.apply(component, args);
    }.bind(this));
  },

  // Go through errors from server and grab the components
  // stored in the inputs map. Change their state to invalid
  // and set the serverError message
  updateInputsWithError: function (errors) {
    Object.keys(errors).forEach(function (name, index) {
      var component = this.inputs[name];

      if (!component) {
        throw new Error('You are trying to update an input that does not exists. Verify errors object with input names. ' + JSON.stringify(errors));
      }

      var args = [{
        _isValid: false,
        _externalError: errors[name]
      }];
      component.setState.apply(component, args);
    }.bind(this));
  },

  // Traverse the children and children of children to find
  // all inputs by checking the name prop. Maybe do a better
  // check here
  traverseChildrenAndRegisterInputs: function (children) {

    if (typeof children !== 'object' || children === null) {
      return children;
    }
    return React.Children.map(children, function (child) {

      if (typeof child !== 'object' || child === null) {
        return child;
      }

      if (child.props && child.props.name) {

        return React.cloneElement(child, {
          validate: this.validateComponent,
          _attachToForm: this.attachToForm,
          _detachFromForm: this.detachFromForm,
          _isFormDisabled: this.isFormDisabled,
          _isValidValue: function (component, value) {
            return this.runValidation(component, value).isValid;
          }.bind(this)
        }, child.props && child.props.children);
      } else {
        return React.cloneElement(child, {}, this.traverseChildrenAndRegisterInputs(child.props && child.props.children));
      }

    }, this);

  },

  isFormDisabled: function () {
    return this.props.disabled;
  },

  getCurrentValues: function () {
    return Object.keys(this.inputs).reduce(function (data, name) {
      var component = this.inputs[name];
      data[name] = component.getValue();
      return data;
    }.bind(this), {});
  },

  setFormPristine: function (isPristine) {
    var inputs = this.inputs;
    var inputKeys = Object.keys(inputs);

    this.internalState.formSubmitted = !isPristine;

    // Iterate through each component and set it as pristine
    // or "dirty".
    inputKeys.forEach(function (name, index) {
      var component = inputs[name];
      component.setState({
        _isPristine: isPristine,
        _formSubmitted: !isPristine
      });
    }.bind(this));
  },

  // Use the binded values and the actual input value to
  // validate the input and set its state. Then check the
  // state of the form itself
  validateComponent: function (component) {

    // Trigger onChange
    if (this.internalState.canChange) {
      this.props.onChange(this.getCurrentValues());
    }

    var validation = this.runValidation(component);
    // Run through the validations, split them up and call
    // the validator IF there is a value or it is required
    component.setState({
      _isValid: validation.isValid,
      _showRequired: validation.isRequired,
      _isPristine: validation.isPristine,
      _validationError: validation.error,
      _externalError: null
    }, this.validate);

  },

  // Checks validation on current value or a passed value
  runValidation: function (component, value) {

    var currentValues = this.getCurrentValues();
    var validationErrors = component.props.validationErrors;
    var validationError = component.props.validationError;
    value = arguments.length === 2 ? value : component.getValue();

    var validationResults = this.runRules(value, currentValues, component._validations);
    var requiredResults = this.runRules(value, currentValues, component._requiredValidations);

    // the component defines an explicit validate function
    if (typeof component.validate === "function") {
      validationResults.failed = component.validate() ? [] : ['failed'];
    }

    var isRequired = Object.keys(component._requiredValidations).length ? !!requiredResults.success.length : false;
    var isValid = !validationResults.failed.length && !(this.props.validationErrors && this.props.validationErrors[component.props.name]);

    return {
      isRequired: isRequired,
      isValid: isRequired ? false : isValid,
      isPristine: !component.state._isPristine ? false : value === component.state._defaultValue,
      error: (function () {

        if (isValid && !isRequired) {
          return '';
        }

        if (validationResults.errors.length) {
          return validationResults.errors[0];
        }

        if (this.props.validationErrors && this.props.validationErrors[component.props.name]) {
          return this.props.validationErrors[component.props.name];
        }

        if (isRequired) {
          return validationErrors[requiredResults.success[0]] || null;
        }

        if (!isValid) {
          return validationErrors[validationResults.failed[0]] || validationError;
        }

      }.call(this))
    };

  },

  runRules: function (value, currentValues, validations) {

    var results = {
      errors: [],
      failed: [],
      success: []
    };
    if (Object.keys(validations).length) {
      Object.keys(validations).forEach(function (validationMethod) {

        if (validationRules[validationMethod] && typeof validations[validationMethod] === 'function') {
          throw new Error('Formsy does not allow you to override default validations: ' + validationMethod);
        }

        if (!validationRules[validationMethod] && typeof validations[validationMethod] !== 'function') {
          throw new Error('Formsy does not have the validation rule: ' + validationMethod);
        }

        if (typeof validations[validationMethod] === 'function') {
          var validation = validations[validationMethod](currentValues, value);
          if (typeof validation === 'string') {
            results.errors.push(validation);
            results.failed.push(validationMethod);
          } else if (!validation) {
            results.failed.push(validationMethod);
          }
          return;

        } else if (typeof validations[validationMethod] !== 'function') {
          var validation = validationRules[validationMethod](currentValues, value, validations[validationMethod]);
          if (typeof validation === 'string') {
            results.errors.push(validation);
            results.failed.push(validationMethod);
          } else if (!validation) {
            results.failed.push(validationMethod);
          } else {
            results.success.push(validationMethod);
          }
          return;

        }

        return results.success.push(validationMethod);

      });
    }

    return results;

  },

  // Validate the form by going through all child input components
  // and check their state
  validate: function () {
    var allIsValid = true;
    var inputs = this.inputs;
    var inputKeys = Object.keys(inputs);

    // Run validation again in case affected by other inputs. The
    // last component validated will run the onValidationComplete callback
    inputKeys.forEach(function (name, index) {
      var component = inputs[name];
      var validation = this.runValidation(component);
      if (validation.isValid && component.state._externalError) {
        validation.isValid = false;
      }
      if (!validation.isValid) {
        allIsValid = false;
      }
      component.setState({
        _isValid: validation.isValid,
        _showRequired: validation.isRequired,
        _isPristine: validation.isPristine,
        _validationError: validation.error,
        _externalError: !validation.isValid && component.state._externalError ? component.state._externalError : null
      });
    }.bind(this));

    this.internalState.isValid = allIsValid;

    if (allIsValid) {
      this.props.onValid();
    } else {
      this.props.onInvalid();
    }

    // Tell the form that it can start to trigger change events
    this.internalState.canChange = true;
  },

  // Method put on each input component to register
  // itself to the form
  attachToForm: function (component) {
    this.inputs[component.props.name] = component;
    this.model[component.props.name] = component.getValue();
  },

  // Method put on each input component to unregister
  // itself from the form
  detachFromForm: function (component) {
    delete this.inputs[component.props.name];
    delete this.model[component.props.name];
  },
  render: function () {

    return React.DOM.form({
        onSubmit: this.submit,
        className: this.props.className
      },
      this.traverseChildrenAndRegisterInputs(this.props.children)
    );

  }
});

if (!global.exports && !global.module && (!global.define || !global.define.amd)) {
  global.Formsy = Formsy;
}

module.exports = Formsy;
