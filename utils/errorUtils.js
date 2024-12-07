// Helper function to safely check error strings
const checkErrorIncludes = (error, searchString) => {
    if (!error) return false;
    const errorString = JSON.stringify(error).toLowerCase();
    return errorString.includes(searchString.toLowerCase());
};

// Error type checkers
const isInsufficientFundsError = (error) => {
    return checkErrorIncludes(error, 'insufficient') || 
           checkErrorIncludes(error, 'balance') ||
           checkErrorIncludes(error, 'not enough funds');
};

const isRequiredFieldError = (error) => {
    return checkErrorIncludes(error, 'required') ||
           checkErrorIncludes(error, 'missing field');
};

const isInvalidInputError = (error) => {
    return checkErrorIncludes(error, 'invalid') ||
           checkErrorIncludes(error, 'not valid') ||
           checkErrorIncludes(error, 'incorrect format');
};

// HTTP status code determiner
const getErrorStatusCode = (error) => {
    if (!error) return 500;

    if (isRequiredFieldError(error) || isInvalidInputError(error)) {
        return 400; // Bad Request
    }
    if (isInsufficientFundsError(error)) {
        return 402; // Payment Required
    }
    if (checkErrorIncludes(error, 'not found')) {
        return 404; // Not Found
    }
    
    return 500; // Internal Server Error
};

module.exports = {
    isInsufficientFundsError,
    isRequiredFieldError,
    isInvalidInputError,
    getErrorStatusCode,
    checkErrorIncludes
}; 