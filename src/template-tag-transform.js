const filePath = require('path');
const {
  registerRefs,
  TEMPLATE_TAG_NAME,
  buildPrecompileTemplateCall,
} = require('../lib/util');

/**
 * Supports the following syntaxes:
 *
 * const Foo = [GLIMMER_TEMPLATE('hello')];
 *
 * export const Foo = [GLIMMER_TEMPLATE('hello')];
 *
 * export default [GLIMMER_TEMPLATE('hello')];
 *
 * class Foo {
 *   [GLIMMER_TEMPLATE('hello')];
 * }
 */
module.exports.transformTemplateTag = function (t, templatePath, state) {
  let compiled = buildPrecompileTemplateCall(t, templatePath, state);
  let path = templatePath.parentPath;
  let filename = filePath.parse(state.file.opts.filename).name;

  if (path.type === 'ArrayExpression') {
    let arrayParentPath = path.parentPath;
    let varId =
      arrayParentPath.node.id || path.scope.generateUidIdentifier(filename);

    const templateOnlyComponentExpression = t.callExpression(
      buildSetComponentTemplate(path, state),
      [
        compiled,
        t.callExpression(
          state.importUtil.import(
            templatePath,
            '@ember/component/template-only',
            'default',
            'templateOnly'
          ),
          [t.stringLiteral(filename), t.stringLiteral(varId.name)]
        ),
      ]
    );

    if (
      arrayParentPath.type === 'ExpressionStatement' &&
      arrayParentPath.parentPath.type === 'Program'
    ) {
      registerRefs(
        arrayParentPath.replaceWith(
          t.exportDefaultDeclaration(templateOnlyComponentExpression)
        ),
        (newPath) => [
          newPath.get('declaration.callee'),
          newPath.get('declaration.arguments.0.callee'),
          newPath.get('declaration.arguments.1.callee'),
        ]
      );
    } else {
      registerRefs(
        path.replaceWith(templateOnlyComponentExpression),
        (newPath) => [
          newPath.get('callee'),
          newPath.get('arguments.0.callee'),
          newPath.get('arguments.1.callee'),
        ]
      );
    }
  } else if (path.type === 'ClassProperty') {
    let classPath = path.parentPath.parentPath;

    if (classPath.node.type === 'ClassDeclaration') {
      registerRefs(
        classPath.insertAfter(
          t.expressionStatement(
            t.callExpression(buildSetComponentTemplate(path, state), [
              compiled,
              classPath.node.id,
            ])
          )
        ),
        (newPath) => [
          newPath.get('expression.callee'),
          newPath.get('expression.arguments.0.callee'),
        ]
      );
    } else {
      registerRefs(
        classPath.replaceWith(
          t.expressionStatement(
            t.callExpression(buildSetComponentTemplate(path, state), [
              compiled,
              classPath.node,
            ])
          )
        ),
        (newPath) => [
          newPath.parentPath.get('callee'),
          newPath.parentPath.get('arguments.0.callee'),
        ]
      );
    }

    path.remove();

    return;
  } else {
    throw path.buildCodeFrameError(
      `Attempted to use \`<${TEMPLATE_TAG_NAME}>\` to define a template in an unsupported way. Templates defined using this syntax must be:\n\n1. Assigned to a variable declaration OR\n2. The default export of a file OR\n2. In the top level of the file on their own (sugar for \`export default\`) OR\n4. Used directly within a named class body`
    );
  }
};

function buildSetComponentTemplate(path, state) {
  return state.importUtil.import(
    path,
    '@ember/component',
    'setComponentTemplate'
  );
}
