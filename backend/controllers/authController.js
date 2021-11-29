const { promisify } = require('util');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('./../models/userModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const Email = require('./../utils/email');
const cloudinary = require('cloudinary');


  
// AFTER DEPLOYMENT
// const createSendToken = (user, statusCode, req, res) => {
//     const token = signToken(user._id);
   
  
//     res.cookie('jwt', token, {
//       expires: new Date(
//         Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
//       ),
//       httpOnly: true,
//       secure: req.secure || req.headers['x-forwarded-proto'] === 'https'
//     });
  
//     // Remove password from output
//     user.password = undefined;
  
//     res.status(statusCode).json({
//       status: 'success',
//       token,
//       data: {
//         user
//       }
//     });
// };

const signToken = id => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  // BEFORE DEPLOYMENT
  // const cookieOptions = {
  //     expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000),
  //     httpOnly: true
  // };
  // // if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;
  // res.cookie('jwt', token, cookieOptions);

  res.cookie('jwt', token, {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https'
  });

  //remove user from output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    user
  });
}


// SIGNUP NEW USER CONTRLLER
exports.signup = catchAsync(async (req, res, next) => {

    const result = await cloudinary.v2.uploader.upload(req.body.avatar, {
        folder: 'avatars',
        width: 150,
        crop: "scale"
    })

    const { name, email, password, passwordConfirm } = req.body;

    const user = await User.create({
      name,
      email,
      password,
      passwordConfirm,
      avatar: {
          public_id: result.public_id,
          url: result.secure_url
      }
    })
    
    // SENDING WELCOME EMAIL TEMPLATE
    //const url = `${req.protocol}://${req.get('host')}/me`;
    //await new Email(newUser, url).sendWelcome();
    createSendToken(user, 201, res);
    //createSendToken(user, 201, req, res);
    
});


// LOGIN CONTROLLER
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password!', 400));
  }
  // 2) Check if user exists && password is correct
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  // 3) If everything ok, send token to client
 // createSendToken(user, 200, res);
 createSendToken(user, 200, res);
 
});


// LOGOUT CONTROLER
exports.logout = (req, res) => {
    res.cookie('jwt', 'loggedout', {
        expires: new Date(Date.now() + 10 * 1000),
        httpOnly: true
    });
    res.status(200).json({ status: 'success' });
}


// PROTECTED ROUTE USING AUTHURIZATION
exports.protect = catchAsync(async (req, res, next) => {
    // 1) Getting token and check of it's there
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }
  
    if (!token) {
      return next(
        new AppError('You are not logged in! Please log in to get access.', 401)
      );
    }
  
    // 2) Verification token
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  
    // 3) Check if user still exists
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return next(
        new AppError(
          'The user belonging to this token does no longer exist.',
          401
        )
      );
    }
  
    // 4) Check if user changed password after the token was issued
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return next(
        new AppError('User recently changed password! Please log in again.', 401)
      );
    }
  
    // GRANT ACCESS TO PROTECTED ROUTE
    req.user = currentUser;
    //res.locals.user = currentUser;
    next();
});



// CHECK IF TOKEN STILL EXIST
exports.isAuthenticatedUser = catchAsync(async (req, res, next) => {

  const token = req.cookies.jwt

  if (!token) {
      return next(new AppError('Login first to access this resource.', 401))
  }

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET)
  req.user = await User.findById(decoded.id);

  next()
})


// RESTRICT USER ROLES TO ROUTES
exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        // roles ['admin', 'lead-guide']. role='user
        if(!roles.includes(req.user.role)) {
            return next(new AppError('You do not have permission to perform this action!', 403));
        }
        next();
    };

};


// FORGOT PASSWORD CONTROLLER
exports.forgotPassword = catchAsync(async (req, res, next) => {
    // 1) get user based on posted email
        const user = await User.findOne({ email: req.body.email })
        if (!user) {
            return next(new AppError('There is no user with that email address!', 404));
        } 
    // 2) generate the random reset token
        const resetToken = user.createPasswordResetToken();
        await user.save({ validateBeforeSave: false });

    // 3) send it back as user's email
    
     try {
        const resetURL = `${req.protocol}://${req.get('host')}/api/v1/users/resetPassword/${resetToken}`;
        await new Email(user, resetURL).sendPasswordReset();
   
        res.status(200).json({
            status: 'success',
            message: 'Token sent to email'
        });
     } catch (err) {
         user.passwordResetToken = undefined;
         user.passwordResetExpires = undefined;
         await user.save({ validateBeforeSave: false });

         return next(new AppError('there was an error sending this email. try again latter!'), 500);
     }
     
});


// RESET PASSWORD CONTROLLER
exports.resetPassword = async (req, res, next) => {
    // 1) get user base base on token 
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({ passwordResetToken: hashedToken, passwordResetExpires: { $gt: Date.now() } });

    // 2) if token has not expired, and there is a user set the new password
    if (!user) {
        return next(new AppError('Token is invalid or has expired', 400));
    }
    user.password = req.body.password;
    user.password = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // 3) update changedpasswordat propety for the user

    // 4) log the user in, send JWT
    createSendToken(user, 200, req, res);

};


//  UPDATE PASSWORD CONTROLLER
exports.updatePassword = catchAsync(async (req, res, next) => {
    // 1) get user from colection
    const user = await User.findById(req.user.id).select('+password');

    // 2) check if posted current password is correct
    if (!(await user.correctPassword(req.body.passwordCurrent, user.password))) {
        return next(new AppError('Your current password is wrong.', 401))
    }

    // 3) if so, update password
    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    await user.save();
    // User.findByIdAndUpdate will not work as intended!!!

    // 4) log user in, send jwt
    //createSendToken(user, 200, req, res);
    createSendToken(user, 200, res);

});